export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<number>;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  public async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return 1;
    }

    existing.count += 1;
    return existing.count;
  }
}

interface RedisClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ttlMs: number): Promise<number>;
}

export class RedisRateLimitStore implements RateLimitStore {
  public constructor(private readonly redis: RedisClient) {}

  public async increment(key: string, windowMs: number): Promise<number> {
    const namespacedKey = `clawsuit:rate:${key}`;
    const count = await this.redis.incr(namespacedKey);
    if (count === 1) {
      await this.redis.pexpire(namespacedKey, windowMs);
    }
    return count;
  }
}

export class RateLimiter {
  public constructor(
    private readonly deps: {
      store: RateLimitStore;
      limit: number;
      windowMs: number;
    }
  ) {}

  public async enforce(key: string): Promise<void> {
    const count = await this.deps.store.increment(key, this.deps.windowMs);
    if (count > this.deps.limit) {
      throw new Error("Rate limit exceeded");
    }
  }
}
