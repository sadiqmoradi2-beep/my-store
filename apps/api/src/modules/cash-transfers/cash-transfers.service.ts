import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TRANSFER_REFERENCE_TYPE } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { lockRegisters, recordCashTransaction, transactionDate } from '../cash/cash.service';
import { PersonRef } from '../cash/person-ref';
import { CreateTransferDto, ReverseTransferDto, TransferListQueryDto } from './dto/transfer.dto';
import { resolveFinancialActor } from '../../common/financial-actor';
import { assertRealStoreAdmin } from '../../common/store-admin';

type Tx = Prisma.TransactionClient;

/**
 * Internal transfers: money moves between two accounts of the same store. One transfer row + two ledger legs
 * (TRANSFER_OUT on the source, TRANSFER_IN on the destination), written atomically with both accounts locked
 * in id order. The legs are never income or expense, and the store's combined balance does not change.
 * Legs cannot be edited on their own (Stage D refuses linked rows); a mistake is undone with one reversal.
 */
@Injectable()
export class CashTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: TransferListQueryDto) {
    const where: Prisma.CashTransferWhereInput = {
      tenantId,
      ...(query.registerId && { OR: [{ fromRegisterId: query.registerId }, { toRegisterId: query.registerId }] }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.cashTransfer.findMany({
        where,
        include: { fromRegister: { select: { name: true } }, toRegister: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.cashTransfer.count({ where }),
    ]);
    const reversals = await this.prisma.cashTransfer.findMany({
      where: { tenantId, reversalOfId: { in: rows.map((r) => r.id) } },
      select: { id: true, reversalOfId: true },
    });
    const items = rows.map(({ fromRegister, toRegister, ...t }) => ({
      ...t,
      fromRegisterName: fromRegister.name,
      toRegisterName: toRegister.name,
      reversedById: reversals.find((r) => r.reversalOfId === t.id)?.id ?? null,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async create(tenantId: string, userId: string, dto: CreateTransferDto) {
    if (dto.fromRegisterId === dto.toRegisterId) throw new BadRequestException('Source and destination accounts must be different');
    const when = transactionDate(dto.date);
    return this.idempotent(tenantId, userId, dto.requestId, () =>
      this.prisma.$transaction(async (tx) => {
        const { actor: person, user } = await resolveFinancialActor(tx, tenantId, userId, 'TRANSFER', [dto.fromRegisterId, dto.toRegisterId], dto.transferredById);
        const replay = await tx.cashTransfer.findUnique({ where: { tenantId_requestId: { tenantId, requestId: dto.requestId } } });
        if (replay) {
          if (replay.performedById !== userId) throw new ConflictException('Request key belongs to another operator');
          return { replayed: true, transfer: replay };
        }
        const transfer = await this.move(tx, tenantId, userId, {
          requestId: dto.requestId,
          fromRegisterId: dto.fromRegisterId,
          toRegisterId: dto.toRegisterId,
          amount: new Prisma.Decimal(dto.amount),
          person,
          personName: person?.name ?? user.fullName,
          note: dto.note?.trim() || null,
          createdAt: when,
        });
        return { replayed: false, transfer };
      }),
    );
  }

  /** The controlled correction: one reversal per transfer (destination → source, same amount), never an edit */
  async reverse(tenantId: string, userId: string, id: string, dto: ReverseTransferDto) {
    await assertRealStoreAdmin(this.prisma, tenantId, userId);
    return this.idempotent(tenantId, userId, dto.requestId, () =>
      this.prisma.$transaction(async (tx) => {
        const replay = await tx.cashTransfer.findUnique({ where: { tenantId_requestId: { tenantId, requestId: dto.requestId } } });
        if (replay) return { replayed: true, transfer: replay };
        await tx.$queryRaw`SELECT id FROM "CashTransfer" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
        const original = await tx.cashTransfer.findFirst({ where: { id, tenantId } });
        if (!original) throw new NotFoundException('Transfer not found');
        if (original.reversalOfId) throw new UnprocessableEntityException('A reversal cannot be reversed');
        if (await tx.cashTransfer.findUnique({ where: { reversalOfId: id } })) {
          throw new UnprocessableEntityException('This transfer was already reversed');
        }
        const transfer = await this.move(tx, tenantId, userId, {
          requestId: dto.requestId,
          fromRegisterId: original.toRegisterId,
          toRegisterId: original.fromRegisterId,
          amount: original.amount,
          person: original.transferredByPersonId ? { kind: 'PERSON', id: original.transferredByPersonId, name: original.transferredByName } : undefined,
          personName: original.transferredByName,
          note: `Reversal: ${dto.reason.trim()}`.slice(0, 1000),
          reversalOfId: id,
          reversalReason: dto.reason.trim(),
        });
        return { replayed: false, transfer };
      }),
    );
  }

  /** Lock both accounts (id order), validate, write the transfer row and its two legs */
  private async move(
    tx: Tx,
    tenantId: string,
    userId: string,
    input: {
      requestId: string;
      fromRegisterId: string;
      toRegisterId: string;
      amount: Prisma.Decimal;
      person?: PersonRef;
      personName?: string;
      note: string | null;
      createdAt?: Date;
      reversalOfId?: string;
      reversalReason?: string;
    },
  ) {
    await lockRegisters(tx, tenantId, [input.fromRegisterId, input.toRegisterId]);
    const accounts = await tx.cashRegister.findMany({ where: { tenantId, id: { in: [input.fromRegisterId, input.toRegisterId] } } });
    const from = accounts.find((a) => a.id === input.fromRegisterId);
    const to = accounts.find((a) => a.id === input.toRegisterId);
    if (!from || !to) throw new NotFoundException('Account not found in this store');
    if (!from.isActive || !to.isActive) throw new UnprocessableEntityException('Both accounts must be active');
    if (from.balance.lessThan(input.amount)) {
      throw new UnprocessableEntityException(`Insufficient balance on "${from.name}" (available: ${from.balance.toString()})`);
    }
    const name = input.person?.name ?? input.personName ?? '';
    const transfer = await tx.cashTransfer.create({
      data: {
        tenantId,
        requestId: input.requestId,
        fromRegisterId: from.id,
        toRegisterId: to.id,
        amount: input.amount,
        transferredByPersonId: input.person?.id ?? null,
        transferredByName: name,
        note: input.note,
        performedById: userId,
        ...(input.createdAt && { createdAt: input.createdAt }),
        reversalOfId: input.reversalOfId ?? null,
        reversalReason: input.reversalReason ?? null,
      },
    });
    const leg = (registerId: string, type: 'TRANSFER_OUT' | 'TRANSFER_IN', note: string) =>
      recordCashTransaction(tx, {
        tenantId,
        userId,
        registerId,
        type,
        amount: input.amount,
        category: 'Internal transfer',
        note,
        referenceType: TRANSFER_REFERENCE_TYPE,
        referenceId: transfer.id,
        sessionId: null, // the main box of each account — no work session's cash changes
        createdAt: transfer.createdAt,
        transferredBy: input.person,
        staffActor: input.person,
      });
    const tail = input.note ? ` — ${input.note}` : '';
    await leg(from.id, 'TRANSFER_OUT', `Transfer to ${to.name}${tail}`);
    await leg(to.id, 'TRANSFER_IN', `Transfer from ${from.name}${tail}`);
    return transfer;
  }

  /** Same request key twice at the same moment: the second hits the unique key and returns the first result */
  private async idempotent<T>(tenantId: string, userId: string, requestId: string, op: () => Promise<T>) {
    try {
      return await op();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const done = await this.prisma.cashTransfer.findUnique({ where: { tenantId_requestId: { tenantId, requestId } } });
        if (done?.performedById === userId) return { replayed: true, transfer: done };
        throw new ConflictException('Duplicate request');
      }
      throw e;
    }
  }
}
