import { createHash } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const WINDOW_SECONDS = 15 * 60;
/** Failed sign-ins for one account from one network source before a temporary lock */
const MAX_PER_ACCOUNT_AND_IP = 5;
/** Failed sign-ins for one account from all sources (spread-out guessing) before a temporary lock */
const MAX_PER_ACCOUNT = 20;
/** "Forgot password" emails per account per hour */
const MAX_RESET_EMAILS_PER_HOUR = 3;

/**
 * Account-based brute-force protection, independent of the IP throttle. Counters live in Redis (shared by every
 * API instance) and fall back to process memory when Redis is unavailable, so protection never silently turns off.
 * Locks are temporary (they expire with the 15-minute window) and keyed by a hash of the e-mail, whether or not the
 * account exists — so the response never reveals which e-mails are registered.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly memory = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly redis: RedisService) {}

  private key(kind: string, email: string, ip?: string) {
    const id = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
    return `auth:${kind}:${id}${ip ? `:${createHash('sha256').update(ip).digest('hex').slice(0, 16)}` : ''}`;
  }

  private async read(key: string): Promise<number> {
    if (this.redis.isReady) {
      try {
        return Number((await this.redis.client.get(key)) ?? 0);
      } catch {
        /* fall through to memory */
      }
    }
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt < Date.now()) return 0;
    return entry.count;
  }

  private async increment(key: string, ttlSeconds: number) {
    if (this.redis.isReady) {
      try {
        const count = await this.redis.client.incr(key);
        if (count === 1) await this.redis.client.expire(key, ttlSeconds);
        return;
      } catch {
        /* fall through to memory */
      }
    }
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt < Date.now()) this.memory.set(key, { count: 1, expiresAt: Date.now() + ttlSeconds * 1000 });
    else entry.count += 1;
  }

  private async clear(...keys: string[]) {
    if (this.redis.isReady) await this.redis.client.del(...keys).catch(() => undefined);
    for (const k of keys) this.memory.delete(k);
  }

  private locked() {
    return new HttpException(
      'Too many failed sign-in attempts. Please wait 15 minutes and try again, or reset your password.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /** Before checking a password / 2-step code */
  async assertCanTry(email: string, ip: string) {
    const [pair, account] = await Promise.all([
      this.read(this.key('fail', email, ip)),
      this.read(this.key('fail', email)),
    ]);
    if (pair >= MAX_PER_ACCOUNT_AND_IP || account >= MAX_PER_ACCOUNT) throw this.locked();
  }

  async recordFailure(email: string, ip: string) {
    await Promise.all([
      this.increment(this.key('fail', email, ip), WINDOW_SECONDS),
      this.increment(this.key('fail', email), WINDOW_SECONDS),
    ]);
  }

  async recordSuccess(email: string, ip: string) {
    await this.clear(this.key('fail', email, ip), this.key('fail', email));
  }

  /** Reset-password attempts share the sign-in lock (a guessed reset token is as good as a password) */
  async assertCanReset(email: string, ip: string) {
    return this.assertCanTry(email, ip);
  }

  /** true when another "forgot password" e-mail may be sent to this account within the hour */
  async allowResetEmail(email: string) {
    const key = this.key('reset-mail', email);
    if ((await this.read(key)) >= MAX_RESET_EMAILS_PER_HOUR) return false;
    await this.increment(key, 60 * 60);
    return true;
  }
}
