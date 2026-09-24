import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { ExportsService } from './exports.service';

const D = (v: number) => new Prisma.Decimal(v);

describe('ExportsService', () => {
  let service: ExportsService;
  let prisma: {
    product: { findMany: jest.Mock };
    stock: { groupBy: jest.Mock; findMany: jest.Mock };
    order: { findMany: jest.Mock };
  };
  let reportsService: { sales: jest.Mock };

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn().mockResolvedValue([]) },
      stock: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      order: { findMany: jest.fn().mockResolvedValue([]) },
    };
    reportsService = {
      sales: jest.fn().mockResolvedValue({
        points: [],
        totals: { ordersCount: 0, salesTotal: D(0), salesCost: D(0), profit: D(0) },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ExportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReportsService, useValue: reportsService },
      ],
    }).compile();
    service = moduleRef.get(ExportsService);
  });

  describe('products', () => {
    it('scoped to tenantId and non-deleted products', async () => {
      await service.products('t1');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't1', deletedAt: null } }),
      );
      expect(prisma.stock.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 't1' } }),
      );
    });

    it('the export sheet includes the correct name and stock', async () => {
      prisma.product.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'Product 1',
          sku: 'SKU1',
          barcode: '123',
          category: { name: 'Category 1' },
          unit: 'Piece',
          purchasePrice: D(100),
          salePrice: D(150),
          wholesalePrice: null,
          minStockLevel: 5,
          isActive: true,
          createdAt: new Date(),
        },
      ]);
      prisma.stock.groupBy.mockResolvedValue([{ productId: 'p1', _sum: { quantity: 12 } }]);
      const sheet = await service.products('t1');
      expect(sheet.name).toBe('products');
      expect(sheet.rows[0]).toEqual(
        expect.objectContaining({ name: 'Product 1', stock: 12, active: 'Yes' }),
      );
    });
  });

  describe('orders', () => {
    it('an explicit date range and branchId are applied to where', async () => {
      await service.orders('t1', { from: '2026-01-01', to: '2026-01-31', branchId: 'b1' });
      const args = prisma.order.findMany.mock.calls[0][0];
      expect(args.where.tenantId).toBe('t1');
      expect(args.where.branchId).toBe('b1');
      expect(args.where.createdAt.gte.toISOString().slice(0, 10)).toBe('2026-01-01');
      expect(args.where.createdAt.lte.getHours()).toBe(23);
    });

    it('no input range → defaults to 30 days and no branch filter', async () => {
      await service.orders('t1', {});
      const args = prisma.order.findMany.mock.calls[0][0];
      expect(args.where.branchId).toBeUndefined();
      const diffDays =
        (args.where.createdAt.lte.getTime() - args.where.createdAt.gte.getTime()) / 86_400_000;
      expect(Math.round(diffDays)).toBe(30);
    });
  });

  describe('salesReport', () => {
    it('calls reportsService.sales with tenantId and query and appends a grand-total row', async () => {
      reportsService.sales.mockResolvedValue({
        points: [{ bucket: new Date('2026-01-05'), orders: 2, total: D(500), cost: D(200), profit: D(300) }],
        totals: { ordersCount: 2, salesTotal: D(500), salesCost: D(200), profit: D(300) },
      });
      const query = { from: '2026-01-01', to: '2026-01-31' };
      const sheet = await service.salesReport('t1', query);
      expect(reportsService.sales).toHaveBeenCalledWith('t1', query);
      expect(sheet.rows).toHaveLength(2);
      expect(sheet.rows[1]).toEqual(
        expect.objectContaining({ bucket: 'Total', orders: 2, total: 500, cost: 200, profit: 300 }),
      );
    });

    it('no results → only a zeroed grand-total row, no error', async () => {
      const sheet = await service.salesReport('t1', {});
      expect(sheet.rows).toHaveLength(1);
      expect(sheet.rows[0]).toEqual(
        expect.objectContaining({ bucket: 'Total', orders: 0, total: 0, cost: 0, profit: 0 }),
      );
    });
  });
});
