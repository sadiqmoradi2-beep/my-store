import { Prisma, SalaryPaymentStatus } from '@prisma/client';
import { recordCashTransaction } from '../cash/cash.service';
import { resolveSessionId } from '../work-sessions/session-link';
import { resolveFinancialActor } from '../../common/financial-actor';
import { BadRequestException } from '@nestjs/common';

/**
 * Create one salary payment row and — when it is PAID from a register — the matching Income expense.
 * Shared by the regular salary payment and the hourly-pay flow so both book money the same way.
 * Must run inside the caller's database transaction.
 */
export async function createSalaryPayment(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    userId: string;
    employee: { id: string; fullName: string };
    amount: Prisma.Decimal;
    bonus?: Prisma.Decimal;
    deduction?: Prisma.Decimal;
    status: SalaryPaymentStatus;
    period: string;
    registerId?: string;
    note?: string;
    receiptImageUrl?: string;
    sessionId?: string | null;
    paidByPersonId?: string;
    destination?: string;
    /** Back-dated payment day; defaults to now */
    at?: Date;
  },
) {
  const bonus = input.bonus ?? new Prisma.Decimal(0);
  const deduction = input.deduction ?? new Prisma.Decimal(0);
  const netAmount = input.amount.plus(bonus).minus(deduction);
  if ((input.paidByPersonId || input.destination) && (!input.registerId || input.status !== 'PAID')) throw new BadRequestException('Staff attribution requires a paid register payment');
  const payment = await tx.salaryPayment.create({
    data: {
      tenantId: input.tenantId,
      employeeId: input.employee.id,
      amount: input.amount,
      bonus,
      deduction,
      status: input.status,
      period: input.period,
      registerId: input.registerId,
      note: input.note,
      receiptImageUrl: input.receiptImageUrl,
      performedById: input.userId,
      paidAt: input.status === 'PAID' ? (input.at ?? new Date()) : undefined,
      ...(input.at && { createdAt: input.at }),
    },
  });
  if (input.registerId && input.status === 'PAID') {
    const { actor } = await resolveFinancialActor(tx, input.tenantId, input.userId, 'EMPLOYEE_PAYMENT', [input.registerId], input.paidByPersonId);
    await recordCashTransaction(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      registerId: input.registerId,
      type: 'EXPENSE',
      amount: netAmount,
      category: 'Salary',
      note: `Salary for ${input.employee.fullName} — ${input.period}`,
      referenceType: 'salary',
      referenceId: payment.id,
      sessionId: await resolveSessionId(tx, input.tenantId, input.userId, input.sessionId),
      createdAt: input.at,
      // the salary's recipient — Paid By is not recorded by this workflow
      receivedBy: { kind: 'EMPLOYEE', id: input.employee.id, name: input.employee.fullName },
      paidBy: actor,
      staffActor: actor,
      destination: input.destination?.trim() || undefined,
    });
  }
  return payment;
}
