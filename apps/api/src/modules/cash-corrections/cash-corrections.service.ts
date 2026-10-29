import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CashTransactionType, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { isRetiredPart } from '@my-store/shared';
import {
  CASH_TRANSACTION_DIRECTION,
  CORRECTABLE_TRANSACTION_TYPES,
  CORRECTION_REFERENCE_TYPE,
  EDIT_GRANT_TTL_MS,
  TRANSACTION_EDITING_WINDOW_MS,
  storeClockTime,
  storeDateOf,
  storeTimeZoneOf,
  storeWallTimeToUtc,
  transactionEditingWindowOf,
} from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { assertRealStoreAdmin } from '../../common/store-admin';
import { lockRegisters } from '../cash/cash.service';
import { effectiveOf } from '../cash/effective-amount';
import { computeFigures } from '../work-sessions/session-figures';
import { verifyTotp } from '../auth/totp';
import { CorrectTransactionDto, RequestExceptionDto } from './dto/correction.dto';

type Tx = Prisma.TransactionClient;
type Original = Prisma.CashTransactionGetPayload<{ include: { register: true; session: true } }>;
const zero = () => new Prisma.Decimal(0);

/** Why a transaction can never be corrected here (it belongs to another workflow), or null */
export function blockedReasonOf(t: Original): string | null {
  if (t.correctionOfId) return 'This is a correction entry. Correct the original transaction instead.';
  if (t.referenceType) {
    return `This transaction was created by ${t.referenceType.replace('_', ' ')} — correct it in that workflow, not here.`;
  }
  if (!(CORRECTABLE_TRANSACTION_TYPES as readonly string[]).includes(t.type)) {
    return 'Sales and refunds are corrected through the sale (refund / return), not here.';
  }
  if (t.session?.status === 'CLOSED') return 'Its work session is closed. Reopen the session first.';
  return null;
}

/** The window deadline, from the immutable recording moment (never the editable business date) */
export function deadlineOf(recordedAt: Date | null, settings: unknown): Date | null {
  const window = transactionEditingWindowOf(settings);
  if (!recordedAt || window === 'DISABLED') return null;
  return new Date(recordedAt.getTime() + TRANSACTION_EDITING_WINDOW_MS[window]);
}

@Injectable()
export class CashCorrectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadOriginal(db: Tx | PrismaService, tenantId: string, id: string): Promise<Original> {
    const t = await db.cashTransaction.findFirst({ where: { id, tenantId }, include: { register: true, session: true } });
    if (!t) throw new NotFoundException('Transaction not found');
    return t;
  }

  /** For the Edit dialog: whether and how the Store Admin can correct it */
  async status(tenantId: string, userId: string, id: string) {
    const admin = await assertRealStoreAdmin(this.prisma, tenantId, userId);
    const [t, tenant] = await Promise.all([
      this.loadOriginal(this.prisma, tenantId, id),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } }),
    ]);
    const blockedReason = blockedReasonOf(t);
    const deadline = deadlineOf(t.recordedAt, tenant.settings);
    const eff = (await effectiveOf(this.prisma, [t])).get(t.id);
    const current = eff ?? { amount: t.amount, registerId: t.registerId };
    const currentRegister =
      current.registerId === t.registerId
        ? t.register
        : await this.prisma.cashRegister.findFirstOrThrow({ where: { id: current.registerId, tenantId } });
    const accounts = await this.prisma.cashRegister.findMany({
      where: { tenantId, branchId: t.register.branchId, isActive: true },
      select: { id: true, name: true, part: true },
      orderBy: [{ part: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }],
    }).then((rows) => rows.filter((a) => !isRetiredPart(a.part) || a.id === current.registerId));
    return {
      editable: !blockedReason,
      mode: blockedReason ? null : deadline && deadline.getTime() > Date.now() ? 'WINDOW' : 'EXCEPTION',
      blockedReason,
      window: transactionEditingWindowOf(tenant.settings),
      deadline,
      recordedAt: t.recordedAt,
      version: t.version,
      amount: current.amount,
      registerId: current.registerId,
      registerName: currentRegister.name,
      date: t.createdAt,
      note: t.note,
      branchId: t.register.branchId,
      accounts,
      twoFactorRequired: !!admin.totpEnabledAt,
    };
  }

  /** Admin Exception: re-enter the password (and 2-step code if on) to unlock ONE transaction, once, briefly */
  async requestException(tenantId: string, userId: string, id: string, dto: RequestExceptionDto) {
    const admin = await assertRealStoreAdmin(this.prisma, tenantId, userId);
    if (!(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new BadRequestException('Your password is incorrect');
    }
    if (admin.totpEnabledAt && admin.totpSecret) {
      if (!dto.totpCode || !verifyTotp(admin.totpSecret, dto.totpCode)) {
        throw new BadRequestException('The 2-step verification code is incorrect');
      }
    }
    const t = await this.loadOriginal(this.prisma, tenantId, id);
    const blocked = blockedReasonOf(t);
    if (blocked) throw new UnprocessableEntityException(blocked);
    const grant = await this.prisma.cashTransactionEditGrant.create({
      data: {
        tenantId,
        transactionId: id,
        userId,
        userName: admin.fullName,
        reason: dto.reason.trim(),
        expiresAt: new Date(Date.now() + EDIT_GRANT_TTL_MS),
      },
    });
    return { grantId: grant.id, expiresAt: grant.expiresAt };
  }

  /** Correct amount / date / account / description of one manual transaction — atomically, audited */
  async correct(tenantId: string, userId: string, id: string, dto: CorrectTransactionDto) {
    try {
      return await this.prisma.$transaction((tx) => this.correctIn(tx, tenantId, userId, id, dto), { timeout: 30_000 });
    } catch (e) {
      // two identical retries at the same moment: the second hits the unique request key
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const done = await this.prisma.cashTransactionEdit.findUnique({
          where: { tenantId_requestId: { tenantId, requestId: dto.requestId } },
        });
        if (done && done.transactionId === id) return { replayed: true, edit: done };
      }
      throw e;
    }
  }

  private async correctIn(tx: Tx, tenantId: string, userId: string, id: string, dto: CorrectTransactionDto) {
    const admin = await assertRealStoreAdmin(tx, tenantId, userId);

    // 1. lock the original first, then check idempotency (a retry waits here and then sees the first result)
    await tx.$queryRaw`SELECT id FROM "CashTransaction" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const replay = await tx.cashTransactionEdit.findUnique({ where: { tenantId_requestId: { tenantId, requestId: dto.requestId } } });
    if (replay) {
      if (replay.transactionId !== id) throw new ConflictException('This request key was already used for another transaction');
      return { replayed: true, edit: replay };
    }
    const t = await this.loadOriginal(tx, tenantId, id);
    const blocked = blockedReasonOf(t);
    if (blocked) throw new UnprocessableEntityException(blocked);
    if (t.version !== dto.expectedVersion) {
      throw new ConflictException('This transaction was changed meanwhile. Reload it and try again.');
    }

    // 2. authorization: inside the editing window (from recordedAt), or a valid single-use exception
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
    const now = new Date();
    const deadline = deadlineOf(t.recordedAt, tenant.settings);
    let mode: 'WINDOW' | 'EXCEPTION';
    if (dto.grantId) {
      const used = await tx.cashTransactionEditGrant.updateMany({
        where: { id: dto.grantId, tenantId, transactionId: id, userId, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (used.count !== 1) throw new UnprocessableEntityException('The Admin Exception is invalid, expired or already used');
      mode = 'EXCEPTION';
    } else if (deadline && deadline.getTime() > now.getTime()) {
      mode = 'WINDOW';
    } else {
      throw new UnprocessableEntityException(
        t.recordedAt
          ? 'The editing window for this transaction is closed (or editing is disabled). Use an Admin Exception.'
          : 'This transaction was recorded before editing existed (its recording time is unknown). Use an Admin Exception.',
      );
    }

    // 3. current effective state (original + earlier correction entries) and the wanted state
    const eff = (await effectiveOf(tx, [t])).get(t.id);
    if (eff === null) throw new UnprocessableEntityException('This transaction has inconsistent corrections; editing is blocked. Report it.');
    const before = eff ?? { amount: t.amount, registerId: t.registerId };
    const wantAmount = dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : before.amount;
    const wantRegisterId = dto.registerId ?? before.registerId;
    const tz = storeTimeZoneOf(tenant.settings);
    const wantDate = dto.date ? businessDate(dto.date, t.createdAt, tz, now) : t.createdAt;
    const wantNote = dto.note !== undefined ? dto.note.trim() || null : t.note;
    const moneyChanged = !wantAmount.equals(before.amount) || wantRegisterId !== before.registerId;
    const dateChanged = wantDate.getTime() !== t.createdAt.getTime();
    const noteChanged = wantNote !== t.note;
    if (!moneyChanged && !dateChanged && !noteChanged) throw new BadRequestException('Nothing to change');

    // 4. accounts: same tenant + branch, active; lock them (id order) and check they reconcile
    const accountIds = [...new Set([t.registerId, before.registerId, wantRegisterId])];
    await lockRegisters(tx, tenantId, accountIds);
    const accounts = await tx.cashRegister.findMany({ where: { tenantId, id: { in: accountIds } } });
    const accountOf = (rid: string) => {
      const a = accounts.find((r) => r.id === rid);
      if (!a) throw new NotFoundException('Account not found');
      return a;
    };
    const target = accountOf(wantRegisterId);
    if (target.branchId !== t.register.branchId) throw new UnprocessableEntityException('The account must belong to the same branch');
    if (!target.isActive) throw new UnprocessableEntityException('That account is inactive');
    // a correction may fix history on a retired Card / EBT account, but never move money onto one
    if (wantRegisterId !== before.registerId && isRetiredPart(target.part)) {
      throw new UnprocessableEntityException('Card and EBT accounts are retired — choose Cash, System or Zelle');
    }
    if (moneyChanged) for (const a of accounts) await assertReconciles(tx, a);

    // 5. session: only an active one; the date must stay inside it
    if (t.sessionId && dateChanged && (wantDate < t.session!.startedAt || wantDate > now)) {
      throw new UnprocessableEntityException('The date must stay inside the work session it belongs to');
    }

    const editId = randomUUID();
    const direction = CASH_TRANSACTION_DIRECTION[t.type as CashTransactionType];
    const balanceChanges: { registerId: string; registerName: string; before: string; after: string }[] = [];
    const entryIds: string[] = [];
    let method: 'DIRECT' | 'ENTRIES' | 'NONE' = 'NONE';

    if (moneyChanged) {
      const own = accountOf(t.registerId); // re-read after the lock
      const direct = !eff && wantRegisterId === t.registerId && (await isLatestEntry(tx, t, own.balance));
      if (direct) {
        // The original is provably the newest entry of its account: correct it in place
        const delta = wantAmount.sub(t.amount).mul(direction);
        const newBalance = own.balance.add(delta);
        if (newBalance.isNegative()) throw insufficient(own.name, own.balance);
        await tx.cashRegister.update({ where: { id: t.registerId }, data: { balance: newBalance } });
        await tx.cashTransaction.update({
          where: { id: t.id },
          data: { amount: wantAmount, balanceAfter: t.balanceAfter.add(delta) },
        });
        balanceChanges.push({ registerId: own.id, registerName: own.name, before: own.balance.toString(), after: newBalance.toString() });
        method = 'DIRECT';
      } else {
        // Correction entries: the original and every historical balanceAfter stay as they are
        const legs =
          wantRegisterId === before.registerId
            ? [{ registerId: before.registerId, amount: wantAmount.sub(before.amount) }]
            : [
                { registerId: before.registerId, amount: before.amount.neg() },
                { registerId: wantRegisterId, amount: wantAmount },
              ];
        const balances = new Map(accounts.map((a) => [a.id, a.balance]));
        for (const leg of legs) {
          const account = accountOf(leg.registerId);
          const start = balances.get(leg.registerId)!;
          const after = start.add(leg.amount.mul(direction));
          if (after.isNegative()) throw insufficient(account.name, start);
          balances.set(leg.registerId, after);
          await tx.cashRegister.update({ where: { id: leg.registerId }, data: { balance: after } });
          const entry = await tx.cashTransaction.create({
            data: {
              tenantId,
              registerId: leg.registerId,
              type: t.type,
              amount: leg.amount,
              balanceAfter: after,
              category: t.category,
              note: `Correction of ${t.id.slice(-8)}: ${dto.reason.trim()}`.slice(0, 1000),
              referenceType: CORRECTION_REFERENCE_TYPE,
              referenceId: t.id,
              correctionOfId: t.id,
              correctionEditId: editId,
              sessionId: t.sessionId,
              performedById: userId,
              staffActorPersonId: t.staffActorPersonId,
              staffActorName: t.staffActorName,
              destination: t.destination,
              createdAt: wantDate,
              paidByEmployeeId: t.paidByEmployeeId, paidByPartnerId: t.paidByPartnerId, paidByPersonId: t.paidByPersonId,
              paidByKind: t.paidByKind, paidByName: t.paidByName,
              receivedByEmployeeId: t.receivedByEmployeeId, receivedByPartnerId: t.receivedByPartnerId, receivedByPersonId: t.receivedByPersonId,
              receivedByKind: t.receivedByKind, receivedByName: t.receivedByName,
            },
          });
          entryIds.push(entry.id);
        }
        for (const [rid, after] of balances) {
          const start = accountOf(rid).balance;
          if (!start.equals(after)) balanceChanges.push({ registerId: rid, registerName: accountOf(rid).name, before: start.toString(), after: after.toString() });
        }
        method = 'ENTRIES';
      }
    }

    // 6. date + description on the original; earlier correction entries follow the business date
    await tx.cashTransaction.update({
      where: { id: t.id },
      data: { createdAt: wantDate, note: wantNote, version: { increment: 1 } },
    });
    if (dateChanged) {
      await tx.cashTransaction.updateMany({ where: { tenantId, correctionOfId: t.id }, data: { createdAt: wantDate } });
    }

    // 7. an active session's expected cash must stay valid
    if (t.sessionId && (moneyChanged || dateChanged)) {
      const figures = (await computeFigures(tx, tenantId, [t.session!])).get(t.sessionId)!;
      if (figures.expectedCash.isNegative()) {
        throw new UnprocessableEntityException('This correction would make the work session’s expected cash negative');
      }
    }

    // 8. the audit row — in the same database transaction, so it exists only if the correction does
    const edit = await tx.cashTransactionEdit.create({
      data: {
        id: editId,
        tenantId,
        requestId: dto.requestId,
        transactionId: t.id,
        transactionType: t.type,
        branchId: t.register.branchId,
        editorUserId: userId,
        editorName: admin.fullName,
        mode,
        grantId: dto.grantId ?? null,
        method,
        reason: dto.reason.trim(),
        amountBefore: before.amount,
        amountAfter: wantAmount,
        dateBefore: t.createdAt,
        dateAfter: wantDate,
        registerBeforeId: before.registerId,
        registerBeforeName: accountOf(before.registerId).name,
        registerAfterId: wantRegisterId,
        registerAfterName: target.name,
        noteBefore: t.note,
        noteAfter: wantNote,
        balanceChanges,
        entryIds,
        recordedAtOfOriginal: t.recordedAt,
      },
    });
    return { replayed: false, edit };
  }

  /** Correction history of one transaction, plus restore / reset events, with each correction's ledger state */
  async history(tenantId: string, userId: string, id: string) {
    await assertRealStoreAdmin(this.prisma, tenantId, userId);
    const [edits, events] = await Promise.all([
      this.prisma.cashTransactionEdit.findMany({ where: { tenantId, transactionId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.cashLedgerEvent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    ]);
    return {
      edits: edits.map((e) => ({ ...e, ledgerState: ledgerStateOf(e.createdAt, events) })),
      events: events.filter((ev) => edits.some((e) => ev.createdAt > e.createdAt)),
    };
  }
}

/**
 * A correction is represented in today's ledger unless, after it, a reset removed the ledger or a restore
 * brought back a backup taken before it. Old corrections are never re-applied automatically.
 */
export function ledgerStateOf(
  editedAt: Date,
  events: { kind: string; createdAt: Date; backupCreatedAt: Date | null }[],
  asOf: Date = new Date(8.64e15),
): 'ACTIVE' | 'UNDONE_BY_RESTORE' | 'REMOVED_BY_RESET' {
  // the latest event between the correction and asOf decides; a restore brings back the ledger of its
  // backup's moment, so the answer is then "what was the state at that moment"
  const latest = events
    .filter((e) => e.createdAt > editedAt && e.createdAt <= asOf)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) return 'ACTIVE';
  if (latest.kind === 'RESET') return 'REMOVED_BY_RESET';
  if (!latest.backupCreatedAt || latest.backupCreatedAt <= editedAt) return 'UNDONE_BY_RESTORE';
  return ledgerStateOf(editedAt, events, latest.backupCreatedAt);
}

/** A store calendar day keeping the original time of day on the store clock; never in the future */
export function businessDate(day: string, original: Date, tz: string, now: Date): Date {
  if (day > storeDateOf(now, tz)) throw new BadRequestException('The transaction date cannot be in the future');
  const candidate = storeWallTimeToUtc(`${day}T${storeClockTime(original, tz)}`, tz);
  if (Number.isNaN(candidate.getTime())) throw new BadRequestException('Invalid date');
  // today, with that clock time still ahead: use (just before) now
  return candidate.getTime() > now.getTime() ? new Date(now.getTime() - 1000) : candidate;
}

/**
 * Provably the newest entry of its account: it has a known recording time, nothing was recorded after it
 * (by recording time, never by business date) and its balanceAfter is the account's balance now.
 */
async function isLatestEntry(tx: Tx, t: Original, lockedBalance: Prisma.Decimal): Promise<boolean> {
  if (!t.recordedAt) return false;
  if (!t.balanceAfter.equals(lockedBalance)) return false;
  const later = await tx.cashTransaction.count({
    where: { registerId: t.registerId, id: { not: t.id }, recordedAt: { gte: t.recordedAt } },
  });
  return later === 0;
}

/** The stored account balance must equal opening balance + every transaction's signed effect */
async function assertReconciles(tx: Tx, account: { id: string; name: string; balance: Prisma.Decimal; openingBalance: Prisma.Decimal }) {
  const rows = await tx.cashTransaction.groupBy({ by: ['type'], where: { registerId: account.id }, _sum: { amount: true } });
  const net = rows.reduce(
    (sum, r) => sum.add((r._sum.amount ?? zero()).mul(CASH_TRANSACTION_DIRECTION[r.type as CashTransactionType])),
    account.openingBalance,
  );
  if (!net.equals(account.balance)) {
    throw new UnprocessableEntityException(
      `The account "${account.name}" does not reconcile (balance ${account.balance.toString()}, transactions say ${net.toString()}). Corrections are blocked until it is reviewed.`,
    );
  }
}

function insufficient(name: string, balance: Prisma.Decimal) {
  return new UnprocessableEntityException(`Insufficient balance on "${name}" (available: ${balance.toString()})`);
}
