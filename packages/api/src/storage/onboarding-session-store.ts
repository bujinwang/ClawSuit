import { randomUUID } from "node:crypto";

import type { OnboardingSession } from "../types.js";

const SESSION_PREFIX = "clawsuit:onboarding:";
const USER_SESSION_PREFIX = "clawsuit:onboarding:user:";
const DEFAULT_TTL_SECONDS = 60 * 60 * 24;

interface RedisClient {
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
}

export interface CreateOnboardingSessionInput {
  userId: string;
  roleSlug: string;
  channel: OnboardingSession["channel"];
}

export interface OnboardingSessionStore {
  create(input: CreateOnboardingSessionInput): Promise<OnboardingSession>;
  findById(id: string): Promise<OnboardingSession | undefined>;
  findActiveByUserId(userId: string): Promise<OnboardingSession | undefined>;
  save(session: OnboardingSession): Promise<void>;
  delete(sessionId: string): Promise<void>;
}

export class InMemoryOnboardingSessionStore implements OnboardingSessionStore {
  private readonly sessions = new Map<string, OnboardingSession>();
  private readonly activeByUserId = new Map<string, string>();

  public async create(input: CreateOnboardingSessionInput): Promise<OnboardingSession> {
    const session: OnboardingSession = {
      id: randomUUID(),
      userId: input.userId,
      roleSlug: input.roleSlug,
      step: 0,
      answers: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      channel: input.channel
    };

    this.sessions.set(session.id, session);
    this.activeByUserId.set(session.userId, session.id);
    return session;
  }

  public async findById(id: string): Promise<OnboardingSession | undefined> {
    return this.sessions.get(id);
  }

  public async findActiveByUserId(userId: string): Promise<OnboardingSession | undefined> {
    const sessionId = this.activeByUserId.get(userId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  public async save(session: OnboardingSession): Promise<void> {
    session.updatedAt = new Date();
    this.sessions.set(session.id, session);
    if (!session.completedAt) {
      this.activeByUserId.set(session.userId, session.id);
    }
  }

  public async delete(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.activeByUserId.delete(session.userId);
    }
    this.sessions.delete(sessionId);
  }
}

export class RedisOnboardingSessionStore implements OnboardingSessionStore {
  public constructor(
    private readonly redis: RedisClient,
    private readonly ttlSeconds = DEFAULT_TTL_SECONDS
  ) {}

  public async create(input: CreateOnboardingSessionInput): Promise<OnboardingSession> {
    const session: OnboardingSession = {
      id: randomUUID(),
      userId: input.userId,
      roleSlug: input.roleSlug,
      step: 0,
      answers: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      channel: input.channel
    };

    await this.save(session);
    await this.redis.set(
      `${USER_SESSION_PREFIX}${session.userId}`,
      session.id,
      "EX",
      this.ttlSeconds
    );
    return session;
  }

  public async findById(id: string): Promise<OnboardingSession | undefined> {
    const raw = await this.redis.get(`${SESSION_PREFIX}${id}`);
    return raw ? deserializeSession(raw) : undefined;
  }

  public async findActiveByUserId(userId: string): Promise<OnboardingSession | undefined> {
    const sessionId = await this.redis.get(`${USER_SESSION_PREFIX}${userId}`);
    return sessionId ? this.findById(sessionId) : undefined;
  }

  public async save(session: OnboardingSession): Promise<void> {
    session.updatedAt = new Date();
    await this.redis.set(
      `${SESSION_PREFIX}${session.id}`,
      serializeSession(session),
      "EX",
      this.ttlSeconds
    );

    if (!session.completedAt) {
      await this.redis.set(
        `${USER_SESSION_PREFIX}${session.userId}`,
        session.id,
        "EX",
        this.ttlSeconds
      );
    }
  }

  public async delete(sessionId: string): Promise<void> {
    const session = await this.findById(sessionId);
    await this.redis.del(`${SESSION_PREFIX}${sessionId}`);
    if (session) {
      await this.redis.del(`${USER_SESSION_PREFIX}${session.userId}`);
    }
  }
}

function serializeSession(session: OnboardingSession): string {
  return JSON.stringify(session);
}

function deserializeSession(raw: string): OnboardingSession {
  const parsed = JSON.parse(raw) as Omit<OnboardingSession, "createdAt" | "updatedAt" | "completedAt"> & {
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  };

  return {
    id: parsed.id,
    userId: parsed.userId,
    roleSlug: parsed.roleSlug,
    step: parsed.step,
    answers: parsed.answers,
    channel: parsed.channel,
    createdAt: new Date(parsed.createdAt),
    updatedAt: new Date(parsed.updatedAt),
    ...(parsed.completedAt ? { completedAt: new Date(parsed.completedAt) } : {})
  };
}
