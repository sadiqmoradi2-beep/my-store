import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CashTransactionType, IncomePart, PaymentMethod, Prisma } from '@prisma/client';
import {
  CASH_TRANSACTION_DIRECTION,
  INCOME_PARTS,
  INCOME_PART_NAMES,
  kabulGregorianMonthStartUtc,
  PAYMENT_METHOD_PART,
} from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { resolveSessionId } from '../work-sessions/session-link';
import { CashTransactionListQueryDto, CreateCashTransactionDto, IncomeSummaryQueryDto } from './dto/cash.dto';

const DAY_MS = 86_400_000;
const zero = () => new Prisma.Decimal(0);

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  /** The Income registers — every active branch always has one per part (Cash / EBT / Zelle) */
  async listRegisters(tenantId: string, branchId?: string) {
    await this.ensureRegisters(tenantId);
    const rows = await this.prisma.cashRegister.findMany({
      where: { tenantId, isActive: true, branch: { isActive: true }, ...(branchId && { branchId }) },
      include: { branch: { select: { name: true } } },
      orderBy: [{ branchId: 'asc' }, { part: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(({ branch, ...register }) => ({ ...register, branchName: branch.name }));
  }

  private async ensureRegisters(tenantId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
    });
    for (const branch of branches) {
      for (const part of INCOME_PARTS) {
        await findIncomeRegister(this.prisma, tenantId, branch.id, part);
      }
    }
  }

  async getRegister(tenantId: string, id: string) {
    const register = await this.prisma.cashRegister.findFirst({ where: { id, tenantId } });
    if (!register) throw new NotFoundException('Register not found');
    return register;
  }

  async listTransactions(tenantId: string, registerId: string, query: CashTransactionListQueryDto) {
    await this.getRegister(tenantId, registerId);
    const where: Prisma.CashTransactionWhereInput = {
      registerId,
      ...(query.type && { type: query.type }),
      ...(query.referenceType && { referenceType: query.referenceType }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.cashTransaction.findMany({
        where,
        skip,
        take: query.limit,
        include: {
          performedBy: { select: { fullName: true } },
          session: { select: { code: true, personName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cashTransaction.count({ where }),
    ]);
    const items = rows.map(({ performedBy, session, ...t }) => ({
      ...t,
      performedByName: performedBy.fullName,
      sessionCode: session?.code ?? null,
      sessionPerson: session?.personName ?? null,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async createTransaction(
    tenantId: string,
    userId: string,
    registerId: string,
    dto: CreateCashTransactionDto,
  ) {
    await this.getRegister(tenantId, registerId);
    return this.prisma.$transaction(async (tx) =>
      recordCashTransaction(tx, {
        tenantId,
        userId,
        registerId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        category: dto.category,
        note: dto.note,
        receiptUrl: dto.receiptUrl,
        sessionId: await resolveSessionId(tx, tenantId, userId, dto.sessionId),
        createdAt: transactionDate(dto.date),
      }),
    );
  }

  /**
   * Income overview: per part (Cash / EBT / Zelle) the current balance, the money that came in and went out
   * during the range, and the profit of the sales paid into it — plus the totals across all parts.
   */
  async incomeSummary(tenantId: string, query: IncomeSummaryQueryDto) {
    await this.ensureRegisters(tenantId);
    const from = query.from ? new Date(query.from) : kabulGregorianMonthStartUtc();
    const to = query.to ? endOfDay(new Date(query.to)) : new Date();
    const registerWhere: Prisma.CashRegisterWhereInput = {
      tenantId,
      isActive: true,
      ...(query.branchId && { branchId: query.branchId }),
    };
    const saleWhere: Prisma.SaleWhereInput = {
      tenantId,
      createdAt: { gte: from, lte: to },
      ...(query.branchId && { branchId: query.branchId }),
    };

    const registers = await this.prisma.cashRegister.findMany({
      where: registerWhere,
      select: { id: true, part: true, balance: true },
    });
    const partOfRegister = new Map(registers.map((r) => [r.id, r.part]));
    const [flows, salesByMethod] = await Promise.all([
      this.prisma.cashTransaction.groupBy({
        by: ['registerId', 'type'],
        where: {
          tenantId,
          registerId: { in: registers.map((r) => r.id) },
          createdAt: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
      this.prisma.sale.groupBy({
        by: ['paymentMethod'],
        where: saleWhere,
        _sum: { total: true, cost: true },
        _count: { _all: true },
      }),
    ]);

    const parts = INCOME_PARTS.map((part) => ({
      part,
      name: INCOME_PART_NAMES[part],
      balance: zero(),
      income: zero(),
      expenses: zero(),
      profit: zero(),
      salesCount: 0,
    }));
    const byPart = new Map(parts.map((p) => [p.part as IncomePart, p]));

    for (const r of registers) byPart.get(r.part)!.balance = byPart.get(r.part)!.balance.add(r.balance);
    for (const f of flows) {
      const target = byPart.get(partOfRegister.get(f.registerId)!);
      if (!target) continue;
      const amount = f._sum.amount ?? zero();
      if (CASH_TRANSACTION_DIRECTION[f.type as CashTransactionType] === 1) target.income = target.income.add(amount);
      else target.expenses = target.expenses.add(amount);
    }

    let totalSales = zero();
    let totalProfit = zero();
    let salesCount = 0;
    for (const row of salesByMethod) {
      const total = row._sum.total ?? zero();
      const profit = total.sub(row._sum.cost ?? zero());
      const count = row._count._all;
      totalSales = totalSales.add(total);
      totalProfit = totalProfit.add(profit);
      salesCount += count;
      const target = byPart.get(PAYMENT_METHOD_PART[row.paymentMethod as PaymentMethod])!;
      target.profit = target.profit.add(profit);
      target.salesCount += count;
    }

    return {
      from,
      to,
      parts,
      totals: {
        totalIncome: parts.reduce((sum, p) => sum.add(p.income), zero()),
        totalBalance: parts.reduce((sum, p) => sum.add(p.balance), zero()),
        totalSales,
        totalProfit,
        salesCount,
      },
    };
  }
}

function endOfDay(date: Date): Date {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return new Date(start.getTime() + DAY_MS - 1);
}

interface CashTransactionInput {
  tenantId: string;
  userId: string;
  registerId: string;
  type: CashTransactionType;
  /** Always positive; direction comes from type */
  amount: Prisma.Decimal;
  category?: string;
  note?: string;
  receiptUrl?: string;
  referenceType?: string;
  referenceId?: string;
  /** The work session whose cash box is behind this movement */
  sessionId?: string | null;
  /** When it happened — defaults to now (a back-filled old transaction passes its own date) */
  createdAt?: Date;
}

/**
 * The date of a manually entered transaction: now when not given, otherwise the given day.
 * A date more than a day ahead is refused (a typo'd year must not land in the future).
 */
export function transactionDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (date.getTime() > Date.now() + 86_400_000) {
    throw new BadRequestException('The transaction date cannot be in the future');
  }
  return date;
}

/** Record a register transaction inside a database transaction: updates the balance + rejects if it would go negative */
export async function recordCashTransaction(
  tx: Prisma.TransactionClient,
  input: CashTransactionInput,
) {
  // Always positive — direction comes from type. Enforced here, not just in each caller's DTO,
  // since a negative amount would flip direction and credit a register instead of debiting it.
  if (!input.amount.isPositive()) {
    throw new UnprocessableEntityException('Amount must be positive');
  }
  const register = await tx.cashRegister.findFirst({
    where: { id: input.registerId, tenantId: input.tenantId },
    select: { balance: true, isActive: true },
  });
  if (!register) throw new NotFoundException('Register not found');
  if (!register.isActive) throw new UnprocessableEntityException('Register is inactive');

  const direction = CASH_TRANSACTION_DIRECTION[input.type];
  const balanceAfter = register.balance.add(input.amount.mul(direction));
  if (balanceAfter.isNegative()) {
    throw new UnprocessableEntityException(
      `Insufficient register balance (available: ${register.balance.toString()})`,
    );
  }
  await tx.cashRegister.update({
    where: { id: input.registerId },
    data: { balance: balanceAfter },
  });
  return tx.cashTransaction.create({
    data: {
      tenantId: input.tenantId,
      registerId: input.registerId,
      type: input.type,
      amount: input.amount,
      balanceAfter,
      category: input.category,
      note: input.note,
      receiptUrl: input.receiptUrl,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      sessionId: input.sessionId ?? null,
      performedById: input.userId,
      ...(input.createdAt && { createdAt: input.createdAt }),
    },
  });
}

/**
 * The branch's register for an Income part (Cash / EBT / Zelle) — created on first use, so every branch
 * always has all three. When several exist for a part, the default (then oldest) one wins.
 */
export async function findIncomeRegister(
  db: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  branchId: string,
  part: IncomePart,
) {
  const existing = await db.cashRegister.findFirst({
    where: { tenantId, branchId, part, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  if (existing) return existing;
  return db.cashRegister.create({
    data: { tenantId, branchId, part, name: INCOME_PART_NAMES[part], isDefault: true },
  });
}
