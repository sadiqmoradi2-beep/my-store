import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CashTransactionType, Prisma } from '@prisma/client';
import { CASH_TRANSACTION_DIRECTION } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import {
  CashTransactionListQueryDto,
  CreateCashRegisterDto,
  CreateCashTransactionDto,
  UpdateCashRegisterDto,
} from './dto/cash.dto';

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  async listRegisters(tenantId: string, branchId?: string) {
    const rows = await this.prisma.cashRegister.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      include: { branch: { select: { name: true } } },
      orderBy: [{ branchId: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(({ branch, ...register }) => ({ ...register, branchName: branch.name }));
  }

  async createRegister(tenantId: string, dto: CreateCashRegisterDto) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');

    if (dto.isNetProfitBox && dto.isDefault) {
      throw new UnprocessableEntityException(
        'The net profit register cannot also be the default register — create a separate register for everyday sales so sale amounts aren\'t recorded into net profit again.',
      );
    }
    const openingBalance = new Prisma.Decimal(dto.openingBalance ?? 0);
    return this.prisma.$transaction(async (tx) => {
      const siblings = await tx.cashRegister.count({ where: { branchId: dto.branchId } });
      const isDefault = dto.isDefault ?? (siblings === 0 && !dto.isNetProfitBox);
      if (isDefault) {
        await tx.cashRegister.updateMany({
          where: { branchId: dto.branchId, isDefault: true },
          data: { isDefault: false },
        });
      }
      if (dto.isNetProfitBox) {
        await tx.cashRegister.updateMany({
          where: { branchId: dto.branchId, isNetProfitBox: true },
          data: { isNetProfitBox: false },
        });
      }
      return tx.cashRegister.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          name: dto.name,
          isDefault,
          isNetProfitBox: dto.isNetProfitBox ?? false,
          openingBalance,
          balance: openingBalance,
        },
      });
    });
  }

  async updateRegister(tenantId: string, id: string, dto: UpdateCashRegisterDto) {
    const register = await this.getRegister(tenantId, id);
    const willBeNetProfitBox = dto.isNetProfitBox ?? register.isNetProfitBox;
    const willBeDefault = dto.isDefault ?? register.isDefault;
    if (willBeNetProfitBox && willBeDefault) {
      throw new UnprocessableEntityException(
        'The net profit register cannot also be the default register — create a separate register for everyday sales so sale amounts aren\'t recorded into net profit again.',
      );
    }
    if (dto.isDefault === false && register.isDefault) {
      throw new UnprocessableEntityException(
        'To change the branch\'s default register, make another register the default first — the default register cannot be turned off without a replacement.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.cashRegister.updateMany({
          where: { branchId: register.branchId, isDefault: true, NOT: { id } },
          data: { isDefault: false },
        });
      }
      if (dto.isNetProfitBox) {
        await tx.cashRegister.updateMany({
          where: { branchId: register.branchId, isNetProfitBox: true, NOT: { id } },
          data: { isNetProfitBox: false },
        });
      }
      return tx.cashRegister.update({ where: { id }, data: dto });
    });
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
        include: { performedBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cashTransaction.count({ where }),
    ]);
    const items = rows.map(({ performedBy, ...t }) => ({
      ...t,
      performedByName: performedBy.fullName,
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
    return this.prisma.$transaction((tx) =>
      recordCashTransaction(tx, {
        tenantId,
        userId,
        registerId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        category: dto.category,
        note: dto.note,
      }),
    );
  }
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
  referenceType?: string;
  referenceId?: string;
}

/** Record a register transaction inside a database transaction: updates the balance + rejects if it would go negative */
export async function recordCashTransaction(
  tx: Prisma.TransactionClient,
  input: CashTransactionInput,
) {
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
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      performedById: input.userId,
    },
  });
}

/** The full net profit of a sale is reflected in the "net profit" register — if one exists. */
export async function accrueNetProfit(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  order: {
    id: string;
    branchId: string;
    total: Prisma.Decimal;
    items: { quantity: number; unitCost: Prisma.Decimal }[];
  },
) {
  const totalCost = order.items.reduce(
    (sum, item) => sum.add(item.unitCost.mul(item.quantity)),
    new Prisma.Decimal(0),
  );
  const profit = order.total.sub(totalCost);
  if (!profit.greaterThan(0)) return null;
  const register = await tx.cashRegister.findFirst({
    where: { tenantId, branchId: order.branchId, isNetProfitBox: true, isActive: true },
    select: { id: true },
  });
  if (!register) return null;
  return recordCashTransaction(tx, {
    tenantId,
    userId,
    registerId: register.id,
    type: 'INCOME',
    amount: profit,
    category: 'Net sale profit',
    referenceType: 'net_profit',
    referenceId: order.id,
  });
}

/** Reverse the net-profit share on a return — deducted from the "net profit" register in proportion to the returned items */
export async function reverseNetProfitForReturn(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    userId: string;
    orderId: string;
    branchId: string;
    returnedCost: Prisma.Decimal;
    returnedRevenue: Prisma.Decimal;
  },
) {
  const profit = input.returnedRevenue.sub(input.returnedCost);
  if (!profit.greaterThan(0)) return null;
  const register = await tx.cashRegister.findFirst({
    where: { tenantId: input.tenantId, branchId: input.branchId, isNetProfitBox: true, isActive: true },
    select: { id: true },
  });
  if (!register) return null;
  return recordCashTransaction(tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    registerId: register.id,
    type: 'EXPENSE',
    amount: profit,
    category: 'Profit reversal from return',
    referenceType: 'net_profit_return',
    referenceId: input.orderId,
  });
}
