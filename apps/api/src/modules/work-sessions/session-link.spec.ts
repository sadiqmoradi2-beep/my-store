import { UnprocessableEntityException } from '@nestjs/common';
import { findActiveSessionIdForUser, resolveSessionId } from './session-link';

describe('session link helpers', () => {
  const db = (found: { id: string } | null) => ({ workSession: { findFirst: jest.fn().mockResolvedValue(found) } });

  it('findActiveSessionIdForUser looks for an active session of a seller or employee with this login', async () => {
    const d = db({ id: 'ses-1' });
    expect(await findActiveSessionIdForUser(d as never, 't1', 'u1')).toBe('ses-1');
    expect(d.workSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 't1', status: 'ACTIVE', OR: [{ seller: { userId: 'u1' } }, { employee: { userId: 'u1' } }] },
      }),
    );
  });

  it('no active session → null', async () => {
    expect(await findActiveSessionIdForUser(db(null) as never, 't1', 'u1')).toBeNull();
  });

  it('not given → the performer\'s own active session', async () => {
    expect(await resolveSessionId(db({ id: 'own' }) as never, 't1', 'u1', undefined)).toBe('own');
  });

  it('null or empty → the main cash box (no session), without any lookup', async () => {
    const d = db({ id: 'own' });
    expect(await resolveSessionId(d as never, 't1', 'u1', null)).toBeNull();
    expect(await resolveSessionId(d as never, 't1', 'u1', '')).toBeNull();
    expect(d.workSession.findFirst).not.toHaveBeenCalled();
  });

  it('an explicit id must be an active session of the tenant', async () => {
    const d = db({ id: 'ses-9' });
    expect(await resolveSessionId(d as never, 't1', 'u1', 'ses-9')).toBe('ses-9');
    expect(d.workSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ses-9', tenantId: 't1', status: 'ACTIVE' } }),
    );
    await expect(resolveSessionId(db(null) as never, 't1', 'u1', 'closed')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
