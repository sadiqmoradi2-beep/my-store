import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Currency, DebtDirection, Prisma } from '@prisma/client';
import { debtStatusFor } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { recordCashTransaction } from '../cash/cash.service';
import { CreateDebtDto, DebtListQueryDto, PayDebtDto } from './dto/debt.dto';

@Injectable()
export class DebtsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: DebtListQueryDto) {
    const where: Prisma.DebtWhereInput = {
      tenantId,
      ...(query.direction && { direction: query.direction }),
      ...(query.status && { status: query.status }),
      ...(query.search && {
        partyName: { contains: query.search, mode: 'insensitive' as const },
      }),
      ...(query.overdue && {
        status: { not: 'SETTLED' },
        dueDate: { lt: new Date() },
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.debt.findMany({ where, skip, take: query.limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.debt.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /** Full account history for a supplier: all documents + each one's payments + grand total */
  async bySupplier(tenantId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const debts = await this.debtsWithPayments(tenantId, { supplierId });
    return { party: { id: supplier.id, name: supplier.name }, debts, totals: this.totalsOf(debts) };
  }

  /** Full account history for an employee (advance/loan or unpaid salary): all documents + each one's payments + grand total */
  async byEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, fullName: true },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    const debts = await this.debtsWithPayments(tenantId, { employeeId });
    return { party: { id: employee.id, name: employee.fullName }, debts, totals: this.totalsOf(debts) };
  }

  private async debtsWithPayments(
    tenantId: string,
    where: { supplierId?: string; employeeId?: string },
  ) {
    const rows = await this.prisma.debt.findMany({
      where: { tenantId, ...where },
      include: {
        payments: {
          include: { performedBy: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ payments, ...debt }) => ({
      ...debt,
      payments: payments.map(({ performedBy, ...p }) => ({ ...p, performedByName: performedBy.fullName })),
    }));
  }

  /** Totals broken down by currency — summing amounts across different currencies would be meaningless */
  private totalsOf(debts: { amount: Prisma.Decimal; paidAmount: Prisma.Decimal; currency: Currency }[]) {
    const zero = new Prisma.Decimal(0);
    const byCurrency = new Map<Currency, { amount: Prisma.Decimal; paidAmount: Prisma.Decimal }>();
    for (const d of debts) {
      const row = byCurrency.get(d.currency) ?? { amount: zero, paidAmount: zero };
      byCurrency.set(d.currency, {
        amount: row.amount.add(d.amount),
        paidAmount: row.paidAmount.add(d.paidAmount),
      });
    }
    return Array.from(byCurrency.entries()).map(([currency, row]) => ({
      currency,
      amount: row.amount,
      paidAmount: row.paidAmount,
      remaining: row.amount.sub(row.paidAmount),
    }));
  }

  /** Outstanding balance of receivables and payables */
  async summary(tenantId: string) {
    const sums = await this.prisma.debt.groupBy({
      by: ['direction'],
      where: { tenantId, status: { not: 'SETTLED' } },
      _sum: { amount: true, paidAmount: true },
    });
    const zero = new Prisma.Decimal(0);
    const outstanding = (direction: DebtDirection) => {
      const row = sums.find((s) => s.direction === direction);
      return (row?._sum.amount ?? zero).sub(row?._sum.paidAmount ?? zero);
    };
    return { receivable: outstanding('RECEIVABLE'), payable: outstanding('PAYABLE') };
  }

  async get(tenantId: string, id: string) {
    const debt = await this.prisma.debt.findFirst({
      where: { id, tenantId },
      include: {
        payments: {
          include: { performedBy: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!debt) throw new NotFoundException('Debt/credit document not found');
    const { payments, ...rest } = debt;
    return {
      ...rest,
      payments: payments.map(({ performedBy, ...p }) => ({
        ...p,
        performedByName: performedBy.fullName,
      })),
    };
  }

  async create(tenantId: string, userId: string, dto: CreateDebtDto) {
    if (dto.supplierId && dto.employeeId) {
      throw new BadRequestException('A document can only be linked to one of: supplier or employee');
    }
    if (dto.direction === 'RECEIVABLE' && dto.supplierId) {
      throw new BadRequestException('A receivable (RECEIVABLE) cannot be linked to a supplier');
    }
    // An employee isn't locked to either direction: they can owe the store (advance/loan), or the store can owe them (unpaid salary)
    const partyName = await this.resolvePartyName(tenantId, dto);
    return this.prisma.debt.create({
      data: {
        tenantId,
        direction: dto.direction,
        partyName,
        supplierId: dto.supplierId,
        employeeId: dto.employeeId,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency ?? 'USDT',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes,
        createdById: userId,
      },
    });
  }

  /** Payment/collection: RECEIVABLE → money into the register; PAYABLE → money out */
  async pay(tenantId: string, userId: string, id: string, dto: PayDebtDto) {
    const debt = await this.get(tenantId, id);
    const amount = new Prisma.Decimal(dto.amount);
    const remaining = debt.amount.sub(debt.paidAmount);
    if (amount.greaterThan(remaining)) {
      throw new UnprocessableEntityException(
        `Amount exceeds the remaining balance (remaining: ${remaining.toString()})`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.debtPayment.create({
        data: {
          tenantId,
          debtId: id,
          amount,
          currency: debt.currency,
          registerId: dto.registerId,
          proofImageUrl: dto.proofImageUrl,
          note: dto.note,
          performedById: userId,
        },
      });
      if (dto.registerId) {
        await recordCashTransaction(tx, {
          tenantId,
          userId,
          registerId: dto.registerId,
          type: debt.direction === 'RECEIVABLE' ? 'INCOME' : 'EXPENSE',
          amount,
          category: debt.direction === 'RECEIVABLE' ? 'Receivable collection' : 'Payable settlement',
          note: debt.partyName,
          referenceType: 'debt',
          referenceId: id,
        });
      }
      const paidAmount = debt.paidAmount.add(amount);
      await tx.debt.update({
        where: { id },
        data: {
          paidAmount,
          status: debtStatusFor(debt.amount.toNumber(), paidAmount.toNumber()),
        },
      });
      return payment;
    });
  }

  async remove(tenantId: string, id: string) {
    const debt = await this.get(tenantId, id);
    if (debt.paidAmount.greaterThan(0)) {
      throw new UnprocessableEntityException('A document with payments cannot be deleted');
    }
    return this.prisma.debt.delete({ where: { id } });
  }

  private async resolvePartyName(tenantId: string, dto: CreateDebtDto): Promise<string> {
    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, tenantId, deletedAt: null },
        select: { name: true },
      });
      if (!supplier) throw new NotFoundException('Supplier not found');
      return supplier.name;
    }
    if (dto.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, tenantId },
        select: { fullName: true },
      });
      if (!employee) throw new NotFoundException('Employee not found');
      return employee.fullName;
    }
    if (!dto.partyName) throw new BadRequestException('Counterparty not specified');
    return dto.partyName;
  }
}

interface DebtInput {
  tenantId: string;
  direction: DebtDirection;
  partyName: string;
  supplierId?: string;
  employeeId?: string;
  amount: Prisma.Decimal;
  currency?: Currency;
  referenceType?: string;
  referenceId?: string;
  notes?: string;
  createdById: string;
}

/** Create a debt/credit document inside a transaction — e.g. the remaining balance of a purchase from a supplier */
export function createDebt(tx: Prisma.TransactionClient, input: DebtInput) {
  return tx.debt.create({
    data: {
      tenantId: input.tenantId,
      direction: input.direction,
      partyName: input.partyName,
      supplierId: input.supplierId,
      employeeId: input.employeeId,
      amount: input.amount,
      currency: input.currency ?? 'USDT',
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      notes: input.notes,
      createdById: input.createdById,
    },
  });
}
