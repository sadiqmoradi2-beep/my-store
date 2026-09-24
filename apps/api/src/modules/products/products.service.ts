import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PriceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { CreateProductDto, ProductListQueryDto, UpdateProductDto } from './dto/product.dto';
import { ProductsRepository } from './products.repository';
import { assertPlanLimit } from '../subscriptions/subscriptions.service';
import { SuppliersService } from '../suppliers/suppliers.service';

const PRICE_FIELDS: { field: 'purchasePrice' | 'salePrice' | 'wholesalePrice' | 'promoPrice'; type: PriceType }[] = [
  { field: 'purchasePrice', type: 'PURCHASE' },
  { field: 'salePrice', type: 'SALE' },
  { field: 'wholesalePrice', type: 'WHOLESALE' },
  { field: 'promoPrice', type: 'PROMO' },
];

@Injectable()
export class ProductsService {
  constructor(
    private readonly repo: ProductsRepository,
    private readonly prisma: PrismaService,
    private readonly suppliersService: SuppliersService,
  ) {}

  async list(tenantId: string, query: ProductListQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await this.repo.findMany(
      tenantId,
      skip,
      query.limit,
      query.search,
      query.categoryId,
    );
    const items = rows.map(({ stocks, category, ...product }) => ({
      ...product,
      categoryName: category.name,
      totalStock: stocks.reduce((sum, s) => sum + s.quantity, 0),
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async get(tenantId: string, id: string) {
    const product = await this.repo.findById(tenantId, id);
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** POS lookup by barcode scan */
  async getByBarcode(tenantId: string, barcode: string) {
    const product = await this.repo.findByBarcode(tenantId, barcode);
    if (!product) throw new NotFoundException('No product found with this barcode');
    return product;
  }

  async priceHistory(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const rows = await this.repo.findPriceHistory(tenantId, id);
    return rows.map(({ changedBy, ...row }) => ({ ...row, changedByName: changedBy.fullName }));
  }

  /** Create product + zero Stock rows (all warehouses, or just one if stockWarehouseId is given) + initial PriceHistory — single transaction */
  async create(tenantId: string, userId: string, dto: CreateProductDto) {
    await assertPlanLimit(this.prisma, tenantId, 'products');
    await this.assertCategory(tenantId, dto.categoryId);
    const hasInitialPurchase =
      dto.supplierId !== undefined || dto.branchId !== undefined || dto.initialQuantity !== undefined;
    if (hasInitialPurchase && (!dto.supplierId || !dto.branchId || !dto.initialQuantity)) {
      throw new BadRequestException(
        'To record an initial purchase, supplier, branch, and quantity purchased are all required',
      );
    }
    const allWarehouses = await this.repo.findWarehouseIds(tenantId);
    let warehouses = allWarehouses;
    if (dto.stockWarehouseId) {
      const match = allWarehouses.find((w) => w.id === dto.stockWarehouseId);
      if (!match) throw new BadRequestException('Selected warehouse is not valid');
      warehouses = [match];
    }
    const barcode = dto.barcode || (await this.generateUniqueBarcode(tenantId));
    const sku = dto.sku || (await this.generateUniqueSku(tenantId));

    const product = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          name: dto.name,
          slug: sku.toLowerCase(),
          sku,
          barcode,
          categoryId: dto.categoryId,
          description: dto.description,
          unit: dto.unit ?? 'unit',
          currency: dto.currency ?? 'USDT',
          minStockLevel: dto.minStockLevel ?? 0,
          purchasePrice: new Prisma.Decimal(dto.purchasePrice),
          salePrice: new Prisma.Decimal(dto.salePrice),
          ...(dto.wholesalePrice !== undefined && {
            wholesalePrice: new Prisma.Decimal(dto.wholesalePrice),
          }),
          ...(dto.promoPrice !== undefined && { promoPrice: new Prisma.Decimal(dto.promoPrice) }),
          ...(dto.exchangeRate !== undefined && {
            exchangeRate: new Prisma.Decimal(dto.exchangeRate),
          }),
          ...(dto.expiryDate !== undefined && { expiryDate: new Date(dto.expiryDate) }),
        },
      });
      if (warehouses.length) {
        await tx.stock.createMany({
          data: warehouses.map((w) => ({
            tenantId,
            productId: product.id,
            warehouseId: w.id,
            quantity: 0,
          })),
        });
      }
      await tx.priceHistory.createMany({
        data: PRICE_FIELDS.filter(({ field }) => dto[field] !== undefined).map(({ field, type }) => ({
          tenantId,
          productId: product.id,
          priceType: type,
          oldPrice: null,
          newPrice: new Prisma.Decimal(dto[field]!),
          currency: dto.currency ?? 'USDT',
          changedById: userId,
        })),
      });
      return product;
    });

    if (hasInitialPurchase) {
      await this.suppliersService.createPurchase(tenantId, userId, {
        supplierId: dto.supplierId!,
        branchId: dto.branchId!,
        invoiceImageUrl: dto.invoiceImageUrl,
        items: [
          {
            productId: product.id,
            quantity: dto.initialQuantity!,
            unitCost: dto.purchasePrice,
          },
        ],
      });
    }
    return product;
  }

  /** Update; any price change is recorded in PriceHistory within the same transaction */
  async update(tenantId: string, userId: string, id: string, dto: UpdateProductDto) {
    const existing = await this.get(tenantId, id);
    if (dto.categoryId) await this.assertCategory(tenantId, dto.categoryId);

    const priceChanges = PRICE_FIELDS.filter(({ field }) => {
      const next = dto[field];
      if (next === undefined) return false;
      const current = existing[field];
      return current === null || !new Prisma.Decimal(next).equals(current);
    });

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: toProductData(dto),
      });
      if (priceChanges.length) {
        await tx.priceHistory.createMany({
          data: priceChanges.map(({ field, type }) => ({
            tenantId,
            productId: id,
            priceType: type,
            oldPrice: existing[field],
            newPrice: new Prisma.Decimal(dto[field]!),
            currency: product.currency,
            changedById: userId,
          })),
        });
      }
      return product;
    });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { deleted: true };
  }

  private async assertCategory(tenantId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!category) throw new BadRequestException('Selected category is not valid');
  }

  /** Generate a unique EAN-13 barcode for the tenant — when the user leaves the barcode field empty */
  private async generateUniqueBarcode(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateEan13();
      const exists = await this.prisma.product.findFirst({
        where: { tenantId, barcode: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new BadRequestException('Unable to generate a unique barcode — please try again');
  }

  /** Generate a unique SKU for the tenant — when the user leaves the SKU field empty */
  private async generateUniqueSku(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `SKU-${randomAlphanumeric(8)}`;
      const exists = await this.prisma.product.findFirst({
        where: { tenantId, sku: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
    }
    throw new BadRequestException('Unable to generate a unique SKU — please try again');
  }
}

/** Random EAN-13 barcode with a valid check digit */
function generateEan13(): string {
  const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const checksum = digits.reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (checksum % 10)) % 10;
  return [...digits, check].join('');
}

const SKU_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes look-alikes (0/O, 1/I)
function randomAlphanumeric(length: number): string {
  return Array.from({ length }, () => SKU_ALPHABET[Math.floor(Math.random() * SKU_ALPHABET.length)]).join('');
}

function toProductData(dto: Partial<CreateProductDto> & { isActive?: boolean }) {
  const {
    purchasePrice,
    salePrice,
    wholesalePrice,
    promoPrice,
    exchangeRate,
    expiryDate,
    stockWarehouseId: _stockWarehouseId,
    supplierId: _supplierId,
    branchId: _branchId,
    initialQuantity: _initialQuantity,
    invoiceImageUrl: _invoiceImageUrl,
    ...rest
  } = dto;
  return {
    ...rest,
    ...(purchasePrice !== undefined && { purchasePrice: new Prisma.Decimal(purchasePrice) }),
    ...(salePrice !== undefined && { salePrice: new Prisma.Decimal(salePrice) }),
    ...(wholesalePrice !== undefined && { wholesalePrice: new Prisma.Decimal(wholesalePrice) }),
    ...(promoPrice !== undefined && { promoPrice: new Prisma.Decimal(promoPrice) }),
    ...(exchangeRate !== undefined && { exchangeRate: new Prisma.Decimal(exchangeRate) }),
    ...(expiryDate !== undefined && { expiryDate: new Date(expiryDate) }),
  };
}
