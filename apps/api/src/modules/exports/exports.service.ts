import { Injectable } from '@nestjs/common';
import {
  CASH_TRANSACTION_TYPE_NAMES,
  DEBT_DIRECTION_NAMES,
  DEBT_STATUS_NAMES,
  PAYMENT_METHOD_NAMES,
} from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService, rangeOf } from '../reports/reports.service';
import { ExportQueryDto } from './dto/export-query.dto';
import { ExportSheet, jalali } from './export-sheet';

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportsService: ReportsService,
  ) {}

  async products(tenantId: string): Promise<ExportSheet> {
    const [products, stockSums] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, deletedAt: null },
        include: { category: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.stock.groupBy({ by: ['productId'], where: { tenantId }, _sum: { quantity: true } }),
    ]);
    const stockByProduct = new Map(stockSums.map((s) => [s.productId, s._sum.quantity ?? 0]));
    return {
      name: 'products',
      title: 'Products',
      columns: [
        { key: 'name', header: 'Name', width: 28 },
        { key: 'sku', header: 'SKU' },
        { key: 'barcode', header: 'Barcode' },
        { key: 'category', header: 'Category', width: 20 },
        { key: 'unit', header: 'Unit', width: 10 },
        { key: 'purchasePrice', header: 'Purchase price' },
        { key: 'salePrice', header: 'Sale price' },
        { key: 'wholesalePrice', header: 'Wholesale price' },
        { key: 'stock', header: 'Stock', width: 10 },
        { key: 'minStockLevel', header: 'Min stock', width: 12 },
        { key: 'active', header: 'Active', width: 8 },
        { key: 'createdAt', header: 'Created date' },
      ],
      rows: products.map((p) => ({
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        category: p.category.name,
        unit: p.unit,
        purchasePrice: p.purchasePrice.toNumber(),
        salePrice: p.salePrice.toNumber(),
        wholesalePrice: p.wholesalePrice?.toNumber() ?? null,
        stock: stockByProduct.get(p.id) ?? 0,
        minStockLevel: p.minStockLevel,
        active: p.isActive ? 'Yes' : 'No',
        createdAt: p.createdAt,
      })),
    };
  }

  async sales(tenantId: string, query: ExportQueryDto): Promise<ExportSheet> {
    const { from, to } = rangeOf(query);
    const sales = await this.prisma.sale.findMany({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
        ...(query.branchId && { branchId: query.branchId }),
      },
      include: { branch: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      name: 'sales',
      title: 'Sales',
      columns: [
        { key: 'saleNumber', header: 'Number', width: 10 },
        { key: 'createdAt', header: 'Date' },
        { key: 'branch', header: 'Branch', width: 18 },
        { key: 'method', header: 'Payment method', width: 16 },
        { key: 'total', header: 'Total' },
        { key: 'profit', header: 'Profit' },
      ],
      rows: sales.map((s) => ({
        saleNumber: s.saleNumber,
        createdAt: s.createdAt,
        branch: s.branch.name,
        method: PAYMENT_METHOD_NAMES[s.paymentMethod],
        total: s.total.toNumber(),
        profit: s.total.sub(s.cost).toNumber(),
      })),
    };
  }

  async stock(tenantId: string): Promise<ExportSheet> {
    const stocks = await this.prisma.stock.findMany({
      where: { tenantId },
      include: {
        product: { select: { name: true, sku: true, minStockLevel: true, deletedAt: true } },
        warehouse: { select: { name: true, branch: { select: { name: true } } } },
      },
    });
    const rows = stocks
      .filter((s) => !s.product.deletedAt)
      .sort((a, b) => a.product.name.localeCompare(b.product.name, 'en'))
      .map((s) => ({
        product: s.product.name,
        sku: s.product.sku,
        branch: s.warehouse.branch.name,
        warehouse: s.warehouse.name,
        quantity: s.quantity,
        minStockLevel: s.product.minStockLevel,
        status: s.quantity <= s.product.minStockLevel ? 'Low' : 'Sufficient',
      }));
    return {
      name: 'stock',
      title: 'Warehouse stock',
      columns: [
        { key: 'product', header: 'Product', width: 28 },
        { key: 'sku', header: 'SKU' },
        { key: 'branch', header: 'Branch', width: 18 },
        { key: 'warehouse', header: 'Warehouse', width: 18 },
        { key: 'quantity', header: 'Stock', width: 10 },
        { key: 'minStockLevel', header: 'Minimum', width: 10 },
        { key: 'status', header: 'Status', width: 10 },
      ],
      rows,
    };
  }

  async cash(tenantId: string, query: ExportQueryDto): Promise<ExportSheet> {
    const { from, to } = rangeOf(query);
    const transactions = await this.prisma.cashTransaction.findMany({
      where: { tenantId, createdAt: { gte: from, lte: to } },
      include: {
        register: { select: { name: true } },
        performedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      name: 'cash',
      title: 'Cash transactions',
      columns: [
        { key: 'createdAt', header: 'Date' },
        { key: 'register', header: 'Register', width: 18 },
        { key: 'type', header: 'Type', width: 12 },
        { key: 'amount', header: 'Amount' },
        { key: 'balanceAfter', header: 'Balance' },
        { key: 'category', header: 'Category', width: 16 },
        { key: 'note', header: 'Note', width: 28 },
        { key: 'performedBy', header: 'User', width: 20 },
      ],
      rows: transactions.map((t) => ({
        createdAt: t.createdAt,
        register: t.register.name,
        type: CASH_TRANSACTION_TYPE_NAMES[t.type],
        amount: t.amount.toNumber(),
        balanceAfter: t.balanceAfter.toNumber(),
        category: t.category,
        note: t.note,
        performedBy: t.performedBy.fullName,
      })),
    };
  }

  async debts(tenantId: string): Promise<ExportSheet> {
    const debts = await this.prisma.debt.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      name: 'debts',
      title: 'Debts and receivables',
      columns: [
        { key: 'partyName', header: 'Party', width: 24 },
        { key: 'direction', header: 'Direction', width: 12 },
        { key: 'status', header: 'Status', width: 12 },
        { key: 'amount', header: 'Amount' },
        { key: 'paidAmount', header: 'Paid' },
        { key: 'remaining', header: 'Remaining' },
        { key: 'dueDate', header: 'Due date' },
        { key: 'notes', header: 'Note', width: 26 },
        { key: 'createdAt', header: 'Registered date' },
      ],
      rows: debts.map((d) => ({
        partyName: d.partyName,
        direction: DEBT_DIRECTION_NAMES[d.direction],
        status: DEBT_STATUS_NAMES[d.status],
        amount: d.amount.toNumber(),
        paidAmount: d.paidAmount.toNumber(),
        remaining: d.amount.sub(d.paidAmount).toNumber(),
        dueDate: d.dueDate,
        notes: d.notes,
        createdAt: d.createdAt,
      })),
    };
  }

  async salesReport(tenantId: string, query: ExportQueryDto): Promise<ExportSheet> {
    const report = await this.reportsService.sales(tenantId, query);
    const monthly = query.granularity === 'month';
    const rows: Record<string, unknown>[] = report.points.map((p) => ({
      bucket: monthly ? jalali(p.bucket).slice(0, 7) : jalali(p.bucket).slice(0, 10),
      sales: p.sales,
      total: p.total.toNumber(),
      cost: p.cost.toNumber(),
      profit: p.profit.toNumber(),
    }));
    rows.push({
      bucket: 'Total',
      sales: report.totals.salesCount,
      total: report.totals.salesTotal.toNumber(),
      cost: report.totals.salesCost.toNumber(),
      profit: report.totals.profit.toNumber(),
    });
    return {
      name: 'sales-report',
      title: 'Sales report',
      columns: [
        { key: 'bucket', header: 'Period', width: 14 },
        { key: 'sales', header: 'Sales count', width: 12 },
        { key: 'total', header: 'Sales' },
        { key: 'cost', header: 'Cost' },
        { key: 'profit', header: 'Profit' },
      ],
      rows,
    };
  }
}
