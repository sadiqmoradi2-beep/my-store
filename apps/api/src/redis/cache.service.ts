import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Cache-aside pattern on top of Redis — if Redis is down, fn() is always executed */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    if (!this.redis.isReady) return fn();

    try {
      const cached = await this.redis.client.get(key);
      if (cached !== null) return JSON.parse(cached) as T;
    } catch (err) {
      this.logger.warn(`cache read failed for ${key}: ${(err as Error).message}`);
    }

    const fresh = await fn();
    this.redis.client.set(key, JSON.stringify(fresh), 'EX', ttlSeconds).catch((err) => {
      this.logger.warn(`cache write failed for ${key}: ${(err as Error).message}`);
    });
    return fresh;
  }

  /** Deletes all keys matching the pattern (e.g. `dash:{tenantId}:*` after a data change) */
  async invalidate(pattern: string): Promise<void> {
    if (!this.redis.isReady) return;
    try {
      const keys = await this.redis.client.keys(pattern);
      if (keys.length > 0) await this.redis.client.del(...keys);
    } catch (err) {
      this.logger.warn(`cache invalidate failed for ${pattern}: ${(err as Error).message}`);
    }
  }
}
