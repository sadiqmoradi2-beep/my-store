import { Prisma } from '@prisma/client';
import { notifyLowStock, notifyRoles } from './notifications.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('notifyRoles', () => {
  it('creates notifications for all active users with the given roles', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]) },
      notification: { createManyAndReturn: jest.fn().mockResolvedValue([]) },
    };
    await notifyRoles(tx as never, 't1', ['ADMIN'], { type: 'SYSTEM', title: 'Test' });
    expect(tx.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', role: { key: { in: ['ADMIN'] } } }),
      }),
    );
    expect(tx.notification.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          tenantId: 't1',
          userId: 'u1',
          type: 'SYSTEM',
          title: 'Test',
          channel: 'IN_APP',
          dispatchStatus: 'SENT',
        },
        {
          tenantId: 't1',
          userId: 'u2',
          type: 'SYSTEM',
          title: 'Test',
          channel: 'IN_APP',
          dispatchStatus: 'SENT',
        },
      ],
    });
  });

  it('no recipients → no createManyAndReturn', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { createManyAndReturn: jest.fn() },
    };
    await notifyRoles(tx as never, 't1', ['ADMIN'], { type: 'SYSTEM', title: 'Test' });
    expect(tx.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
});

describe('notifyLowStock', () => {
  function buildTx(stocks: unknown[]) {
    return {
      stock: { findMany: jest.fn().mockResolvedValue(stocks) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
      notification: { createManyAndReturn: jest.fn().mockResolvedValue([]) },
    };
  }

  it('only items below the minimum get an alert', async () => {
    const tx = buildTx([
      { productId: 'p1', quantity: 2, product: { name: 'Low', minStockLevel: 5 } },
      { productId: 'p2', quantity: 50, product: { name: 'Sufficient', minStockLevel: 5 } },
      { productId: 'p3', quantity: 0, product: { name: 'No minimum', minStockLevel: 0 } },
    ]);
    await notifyLowStock(tx as never, 't1', ['p1', 'p2', 'p3'], 'w1');
    expect(tx.notification.createManyAndReturn).toHaveBeenCalledTimes(1);
    const data = tx.notification.createManyAndReturn.mock.calls[0][0].data;
    expect(data[0].type).toBe('LOW_STOCK');
    expect(data[0].refId).toBe('p1');
  });

  it('no shortage → no notification', async () => {
    const tx = buildTx([
      { productId: 'p1', quantity: 10, product: { name: 'Sufficient', minStockLevel: 5 } },
    ]);
    await notifyLowStock(tx as never, 't1', ['p1'], 'w1');
    expect(tx.notification.createManyAndReturn).not.toHaveBeenCalled();
  });
});

describe('Decimal side effect in message', () => {
  it('Decimal converts to a string without error', () => {
    expect(`Amount ${D(1234.5).toString()} USDT`).toBe('Amount 1234.5 USDT');
  });
});
