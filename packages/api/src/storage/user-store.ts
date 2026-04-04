import { randomUUID } from "node:crypto";

import type { UserRecord } from "../types.js";

export interface UserStore {
  findById(id: string): Promise<UserRecord | undefined>;
  findByPhone(phone: string): Promise<UserRecord | undefined>;
  create(phone: string): Promise<UserRecord>;
  save(user: UserRecord): Promise<void>;
}

export class InMemoryUserStore implements UserStore {
  private readonly usersById = new Map<string, UserRecord>();
  private readonly userIdsByPhone = new Map<string, string>();

  public async findById(id: string): Promise<UserRecord | undefined> {
    return this.usersById.get(id);
  }

  public async findByPhone(phone: string): Promise<UserRecord | undefined> {
    const userId = this.userIdsByPhone.get(phone);
    return userId ? this.usersById.get(userId) : undefined;
  }

  public async create(phone: string): Promise<UserRecord> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      return existing;
    }

    const user: UserRecord = {
      id: randomUUID(),
      phone
    };

    await this.save(user);
    return user;
  }

  public async save(user: UserRecord): Promise<void> {
    this.usersById.set(user.id, user);
    this.userIdsByPhone.set(user.phone, user.id);
  }
}

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

const USER_PREFIX = "clawsuit:user:";
const USER_PHONE_PREFIX = "clawsuit:user-phone:";

export class RedisUserStore implements UserStore {
  public constructor(private readonly redis: RedisClient) {}

  public async findById(id: string): Promise<UserRecord | undefined> {
    const raw = await this.redis.get(`${USER_PREFIX}${id}`);
    return raw ? deserializeUser(raw) : undefined;
  }

  public async findByPhone(phone: string): Promise<UserRecord | undefined> {
    const userId = await this.redis.get(`${USER_PHONE_PREFIX}${phone}`);
    return userId ? this.findById(userId) : undefined;
  }

  public async create(phone: string): Promise<UserRecord> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      return existing;
    }

    const user: UserRecord = {
      id: randomUUID(),
      phone
    };
    await this.save(user);
    return user;
  }

  public async save(user: UserRecord): Promise<void> {
    await this.redis.set(`${USER_PREFIX}${user.id}`, JSON.stringify(serializeUser(user)));
    await this.redis.set(`${USER_PHONE_PREFIX}${user.phone}`, user.id);
  }
}

function serializeUser(user: UserRecord): Record<string, unknown> {
  return {
    ...user,
    ...(user.trialEndsAt ? { trialEndsAt: user.trialEndsAt.toISOString() } : {})
  };
}

function deserializeUser(raw: string): UserRecord {
  const parsed = JSON.parse(raw) as Omit<UserRecord, "trialEndsAt"> & { trialEndsAt?: string };
  return {
    id: parsed.id,
    phone: parsed.phone,
    ...(parsed.name ? { name: parsed.name } : {}),
    ...(parsed.email ? { email: parsed.email } : {}),
    ...(parsed.activeRole ? { activeRole: parsed.activeRole } : {}),
    ...(parsed.stripeCustomerId ? { stripeCustomerId: parsed.stripeCustomerId } : {}),
    ...(parsed.trialEndsAt ? { trialEndsAt: new Date(parsed.trialEndsAt) } : {})
  };
}
