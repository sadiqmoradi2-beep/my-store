import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Raw Redis client — with graceful degradation: if Redis is unavailable
 * the API service must keep working (caching/queueing simply become
 * disabled, instead of a 500 error).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private warnedOffline = false;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(this.config.get<string>('redis.url')!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    this.client.on('error', (err) => {
      if (!this.warnedOffline) {
        this.warnedOffline = true;
        this.logger.warn(`Redis unavailable — caching/queue disabled: ${err.message}`);
      }
    });
    this.client.on('connect', () => {
      this.warnedOffline = false;
      this.logger.log('Redis connected');
    });
  }

  async onModuleInit() {
    try {
      await this.client.connect();
    } catch {
      // the error is logged via the 'error' event above; service startup continues
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  get isReady() {
    return this.client.status === 'ready';
  }
}
