import { HttpException } from '@nestjs/common';
import { LoginAttemptsService } from './login-attempts.service';

describe('LoginAttemptsService (Redis offline → in-memory fallback)', () => {
  const redisOffline = { isReady: false, client: {} } as never;
  let svc: LoginAttemptsService;
  beforeEach(() => {
    svc = new LoginAttemptsService(redisOffline);
  });
  const status = async (p: Promise<unknown>) => p.then(() => 'ok', (e: HttpException) => e.getStatus());

  it('locks one account + source after 5 failures, temporarily (429), without affecting other sources', async () => {
    for (let i = 0; i < 5; i++) await svc.recordFailure('Owner@Shop.com', '1.1.1.1');
    expect(await status(svc.assertCanTry('owner@shop.com', '1.1.1.1'))).toBe(429); // e-mail case does not matter
    expect(await status(svc.assertCanTry('owner@shop.com', '2.2.2.2'))).toBe('ok'); // the real owner elsewhere
    expect(await status(svc.assertCanTry('other@shop.com', '1.1.1.1'))).toBe('ok');
  });

  it('locks an account after 20 failures spread over many sources', async () => {
    for (let i = 0; i < 20; i++) await svc.recordFailure('target@shop.com', `10.0.0.${i}`);
    expect(await status(svc.assertCanTry('target@shop.com', '9.9.9.9'))).toBe(429);
  });

  it('a successful sign-in clears the counters', async () => {
    for (let i = 0; i < 4; i++) await svc.recordFailure('a@b.c', 'ip');
    await svc.recordSuccess('a@b.c', 'ip');
    for (let i = 0; i < 4; i++) await svc.recordFailure('a@b.c', 'ip');
    expect(await status(svc.assertCanTry('a@b.c', 'ip'))).toBe('ok');
  });

  it('the lock expires with its window', async () => {
    jest.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) await svc.recordFailure('x@y.z', 'ip');
      expect(await status(svc.assertCanTry('x@y.z', 'ip'))).toBe(429);
      jest.setSystemTime(Date.now() + 15 * 60 * 1000 + 1);
      expect(await status(svc.assertCanTry('x@y.z', 'ip'))).toBe('ok');
    } finally {
      jest.useRealTimers();
    }
  });

  it('at most 3 reset e-mails per account per hour', async () => {
    const sent = [];
    for (let i = 0; i < 5; i++) sent.push(await svc.allowResetEmail('r@s.t'));
    expect(sent).toEqual([true, true, true, false, false]);
  });

  it('works the same for e-mails that are not registered (no enumeration)', async () => {
    for (let i = 0; i < 5; i++) await svc.recordFailure('nobody@nowhere.test', 'ip');
    expect(await status(svc.assertCanTry('nobody@nowhere.test', 'ip'))).toBe(429);
  });
});
