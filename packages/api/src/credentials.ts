import crypto from "node:crypto";

export interface StoredCredential {
  userId: string;
  service: string;
  encryptedData: string;
}

export interface CredentialRepository {
  upsert(record: StoredCredential): Promise<void>;
  get(userId: string, service: string): Promise<StoredCredential | undefined>;
  list(userId: string): Promise<StoredCredential[]>;
  delete(userId: string, service: string): Promise<void>;
}

export interface SetupTokenStore {
  set(token: string, payload: { userId: string; service: string }, ttlSeconds: number): Promise<void>;
  get(token: string): Promise<{ userId: string; service: string } | undefined>;
  delete(token: string): Promise<void>;
}

export class InMemoryCredentialRepository implements CredentialRepository {
  private readonly store = new Map<string, StoredCredential>();

  public async upsert(record: StoredCredential): Promise<void> {
    this.store.set(makeCredentialKey(record.userId, record.service), record);
  }

  public async get(userId: string, service: string): Promise<StoredCredential | undefined> {
    return this.store.get(makeCredentialKey(userId, service));
  }

  public async list(userId: string): Promise<StoredCredential[]> {
    return [...this.store.values()].filter((record) => record.userId === userId);
  }

  public async delete(userId: string, service: string): Promise<void> {
    this.store.delete(makeCredentialKey(userId, service));
  }
}

export class InMemorySetupTokenStore implements SetupTokenStore {
  private readonly store = new Map<string, { userId: string; service: string; expiresAt: number }>();

  public async set(token: string, payload: { userId: string; service: string }, ttlSeconds: number): Promise<void> {
    this.store.set(token, { ...payload, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  public async get(token: string): Promise<{ userId: string; service: string } | undefined> {
    const entry = this.store.get(token);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(token);
      return undefined;
    }
    return { userId: entry.userId, service: entry.service };
  }

  public async delete(token: string): Promise<void> {
    this.store.delete(token);
  }
}

interface RedisClient {
  set(key: string, value: string, ...args: Array<string | number>): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

const CREDENTIAL_PREFIX = "clawsuit:credential:";
const TOKEN_PREFIX = "clawsuit:cred-setup:";

export class RedisCredentialRepository implements CredentialRepository {
  public constructor(private readonly redis: RedisClient) {}

  public async upsert(record: StoredCredential): Promise<void> {
    await this.redis.set(makeCredentialKey(record.userId, record.service), JSON.stringify(record));
  }

  public async get(userId: string, service: string): Promise<StoredCredential | undefined> {
    const raw = await this.redis.get(makeCredentialKey(userId, service));
    return raw ? (JSON.parse(raw) as StoredCredential) : undefined;
  }

  public async list(userId: string): Promise<StoredCredential[]> {
    const records: StoredCredential[] = [];
    for (const service of ["pillar9", "google_calendar"]) {
      const record = await this.get(userId, service);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  public async delete(userId: string, service: string): Promise<void> {
    await this.redis.del(makeCredentialKey(userId, service));
  }
}

export class RedisSetupTokenStore implements SetupTokenStore {
  public constructor(private readonly redis: RedisClient) {}

  public async set(token: string, payload: { userId: string; service: string }, ttlSeconds: number): Promise<void> {
    await this.redis.set(`${TOKEN_PREFIX}${token}`, JSON.stringify(payload), "EX", ttlSeconds);
  }

  public async get(token: string): Promise<{ userId: string; service: string } | undefined> {
    const raw = await this.redis.get(`${TOKEN_PREFIX}${token}`);
    return raw ? (JSON.parse(raw) as { userId: string; service: string }) : undefined;
  }

  public async delete(token: string): Promise<void> {
    await this.redis.del(`${TOKEN_PREFIX}${token}`);
  }
}

export class CredentialService {
  private readonly encryptionKey: Buffer;

  public constructor(
    private readonly deps: {
      encryptionKeyHex: string;
      repository: CredentialRepository;
      setupTokens: SetupTokenStore;
      appUrl: string;
    }
  ) {
    this.encryptionKey = validateEncryptionKey(deps.encryptionKeyHex);
  }

  public async encryptCredential(data: Record<string, string>): Promise<string> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const json = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  public async decryptCredential(encryptedBase64: string): Promise<Record<string, string>> {
    const buffer = Buffer.from(encryptedBase64, "base64");
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as Record<string, string>;
  }

  public async generateCredentialSetupLink(userId: string, service: string): Promise<string> {
    const token = crypto.randomBytes(32).toString("hex");
    await this.deps.setupTokens.set(token, { userId, service }, 900);
    return `${this.deps.appUrl.replace(/\/$/, "")}/connect/${service}?token=${token}`;
  }

  public async saveCredential(token: string, credentialData: Record<string, string>): Promise<void> {
    const payload = await this.deps.setupTokens.get(token);
    if (!payload) {
      throw new Error("Invalid or expired token");
    }

    const encryptedData = await this.encryptCredential(credentialData);
    await this.deps.repository.upsert({
      userId: payload.userId,
      service: payload.service,
      encryptedData
    });
    await this.deps.setupTokens.delete(token);
  }

  public async getCredential(userId: string, service: string): Promise<Record<string, string> | undefined> {
    const stored = await this.deps.repository.get(userId, service);
    return stored ? this.decryptCredential(stored.encryptedData) : undefined;
  }

  public async listCredentials(userId: string): Promise<Array<{ service: string }>> {
    const records = await this.deps.repository.list(userId);
    return records.map((record) => ({ service: record.service }));
  }

  public async renderSetupPage(token: string, service: string): Promise<string> {
    const payload = await this.deps.setupTokens.get(token);
    if (!payload || payload.service !== service) {
      throw new Error("Invalid or expired token");
    }

    return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Connect ${service}</title></head>
  <body>
    <h1>Connect ${service}</h1>
    <form method="post" action="/api/v1/credentials/${token}/save">
      <label>Access Token <input name="accessToken" /></label>
      <label>Refresh Token <input name="refreshToken" /></label>
      <button type="submit">Save</button>
    </form>
  </body>
</html>`;
  }
}

function validateEncryptionKey(encryptionKeyHex: string): Buffer {
  const key = Buffer.from(encryptionKeyHex, "hex");
  if (key.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must be 64 hex chars");
  }
  return key;
}

function makeCredentialKey(userId: string, service: string): string {
  return `${CREDENTIAL_PREFIX}${userId}:${service}`;
}
