import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from './products.service';
import { ProductsRepository } from './products.repository';
import { SuppliersService } from '../suppliers/suppliers.service';

const D = (v: number) => new Prisma.Decimal(v);

type RepoMock = jest.Mocked<Pick<ProductsRepository, 'findById' | 'findWarehouseIds'>>;

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let repo: RepoMock;
  let tx: Record<string, Record<string, jest.Mock>>;
  let suppliers: jest.Mocked<Pick<SuppliersService, 'createPurchase'>>;

  const existingProduct = {
    id: 'p1',
    tenantId: 't1',
    categoryId: 'c1',
    currency: 'USDT',
    purchasePrice: D(80),
    salePrice: D(100),
    wholesalePrice: null,
    promoPrice: null,
  };

  const createDto = {
    name: 'محصول تست',
    sku: 'SKU1',
    categoryId: 'c1',
    purchasePrice: 80,
    salePrice: 100,
  };

  beforeEach(async () => {
    tx = {
      product: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'p-new', ...data })),
        update: jest.fn().mockResolvedValue({ id: 'p1', currency: 'USDT' }),
      },
      stock: { createMany: jest.fn() },
      priceHistory: { createMany: jest.fn() },
    };
    prisma = {
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      subscription: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ plan: { limits: { maxProducts: -1 }, name: 'FREE' } }),
      },
      product: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)) as never,
    };
    repo = {
      findWarehouseIds: jest.fn().mockResolvedValue([{ id: 'w1' }, { id: 'w2' }]),
      findById: jest.fn().mockResolvedValue({ ...existingProduct }),
    } as never;
    suppliers = {
      createPurchase: jest.fn().mockResolvedValue({ id: 'purchase-1' }),
    } as never;

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsRepository, useValue: repo },
        { provide: PrismaService, useValue: prisma },
        { provide: SuppliersService, useValue: suppliers },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  describe('create', () => {
    it('ردیف Stock صفر برای هر گدام فعال ایجاد می‌شود', async () => {
      await service.create('t1', 'u1', createDto as never);
      const data = tx.stock.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual(expect.objectContaining({ warehouseId: 'w1', quantity: 0 }));
      expect(data[1]).toEqual(expect.objectContaining({ warehouseId: 'w2', quantity: 0 }));
    });

    it('بدون گدام فعال → بدون ایجاد Stock', async () => {
      repo.findWarehouseIds.mockResolvedValue([]);
      await service.create('t1', 'u1', createDto as never);
      expect(tx.stock.createMany).not.toHaveBeenCalled();
    });

    it('stockWarehouseId given → only a stock row for that one warehouse is created', async () => {
      await service.create('t1', 'u1', { ...createDto, stockWarehouseId: 'w2' } as never);
      const data = tx.stock.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual(expect.objectContaining({ warehouseId: 'w2', quantity: 0 }));
    });

    it('stockWarehouseId not one of the tenant\'s warehouses → 400, nothing created', async () => {
      await expect(
        service.create('t1', 'u1', { ...createDto, stockWarehouseId: 'not-mine' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('فقط قیمت‌های ارسالی در PriceHistory اولیه ثبت می‌شوند', async () => {
      await service.create('t1', 'u1', createDto as never);
      const data = tx.priceHistory.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(2);
      expect(data.map((d: { priceType: string }) => d.priceType).sort()).toEqual([
        'PURCHASE',
        'SALE',
      ]);
      expect(data.every((d: { oldPrice: unknown }) => d.oldPrice === null)).toBe(true);
    });

    it('با wholesalePrice و promoPrice → ۴ ردیف PriceHistory', async () => {
      await service.create('t1', 'u1', {
        ...createDto,
        wholesalePrice: 70,
        promoPrice: 60,
      } as never);
      const data = tx.priceHistory.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(4);
    });

    it('دسته نامعتبر → خطا و بدون شروع تراکنش', async () => {
      prisma.category.findFirst.mockResolvedValue(null);
      await expect(service.create('t1', 'u1', createDto as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('به سقف پلن محصول رسیده → خطا و بدون شروع تراکنش', async () => {
      prisma.subscription.findUnique.mockResolvedValue({
        plan: { limits: { maxProducts: 5 }, name: 'FREE' },
      });
      prisma.product.count.mockResolvedValue(5);
      await expect(service.create('t1', 'u1', createDto as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('بدون بارکد ورودی → بارکد ۱۳ رقمی EAN-13 خودکار تولید می‌شود', async () => {
      await service.create('t1', 'u1', createDto as never);
      const data = tx.product.create.mock.calls[0][0].data;
      expect(data.barcode).toMatch(/^\d{13}$/);
    });

    it('بارکد ورودی → همان مقدار استفاده می‌شود، بدون تولید خودکار', async () => {
      await service.create('t1', 'u1', { ...createDto, barcode: '1234567890123' } as never);
      const data = tx.product.create.mock.calls[0][0].data;
      expect(data.barcode).toBe('1234567890123');
      expect(prisma.product.findFirst).not.toHaveBeenCalled();
    });

    it('برخورد بارکد تولیدشده → تلاش دوباره تا یافتن مقدار یکتا', async () => {
      prisma.product.findFirst
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValueOnce(null);
      await service.create('t1', 'u1', createDto as never);
      expect(prisma.product.findFirst).toHaveBeenCalledTimes(2);
      const data = tx.product.create.mock.calls[0][0].data;
      expect(data.barcode).toMatch(/^\d{13}$/);
    });

    it('بدون تأمین‌کننده/شعبه/تعداد اولیه → createPurchase فراخوانی نمی‌شود', async () => {
      await service.create('t1', 'u1', createDto as never);
      expect(suppliers.createPurchase).not.toHaveBeenCalled();
    });

    it('با تأمین‌کننده+شعبه+تعداد اولیه → خرید اولیه برای محصول تازه‌ساخته‌شده ثبت می‌شود', async () => {
      await service.create('t1', 'u1', {
        ...createDto,
        supplierId: 's1',
        branchId: 'b1',
        initialQuantity: 5,
      } as never);
      expect(suppliers.createPurchase).toHaveBeenCalledWith('t1', 'u1', {
        supplierId: 's1',
        branchId: 'b1',
        items: [{ productId: 'p-new', quantity: 5, unitCost: 80 }],
      });
    });

    it('فقط یکی از سه فیلد خرید اولیه ارسال شود → خطا و بدون شروع تراکنش', async () => {
      await expect(
        service.create('t1', 'u1', { ...createDto, supplierId: 's1' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(suppliers.createPurchase).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('تغییر یک فیلد قیمت → فقط همان ردیف در PriceHistory ثبت می‌شود', async () => {
      await service.update('t1', 'u1', 'p1', { salePrice: 150 } as never);
      const data = tx.priceHistory.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual(
        expect.objectContaining({ priceType: 'SALE', newPrice: D(150), oldPrice: D(100) }),
      );
    });

    it('قیمت بدون تغییر → بدون ردیف PriceHistory', async () => {
      await service.update('t1', 'u1', 'p1', { salePrice: 100 } as never);
      expect(tx.priceHistory.createMany).not.toHaveBeenCalled();
    });

    it('چند فیلد قیمت هم‌زمان تغییر می‌کند → فقط ردیف‌های تغییریافته', async () => {
      await service.update('t1', 'u1', 'p1', {
        purchasePrice: 90,
        wholesalePrice: 50,
        salePrice: 100,
      } as never);
      const data = tx.priceHistory.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(2);
      expect(data.map((d: { priceType: string }) => d.priceType).sort()).toEqual([
        'PURCHASE',
        'WHOLESALE',
      ]);
    });

    it('فیلدی که قبلاً null بوده و اکنون مقدار می‌گیرد → oldPrice=null ثبت می‌شود', async () => {
      await service.update('t1', 'u1', 'p1', { wholesalePrice: 60 } as never);
      const data = tx.priceHistory.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(1);
      expect(data[0].oldPrice).toBeNull();
      expect(data[0].priceType).toBe('WHOLESALE');
    });

    it('بدون تغییر هیچ فیلد قیمتی → createMany اصلاً فراخوانی نمی‌شود', async () => {
      await service.update('t1', 'u1', 'p1', { name: 'نام جدید' } as never);
      expect(tx.priceHistory.createMany).not.toHaveBeenCalled();
    });
  });
});
