import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type PersonKind = 'EMPLOYEE' | 'PARTNER' | 'PERSON';

/** A resolved person: kind + id from its own table, plus the name to snapshot on the transaction */
export interface PersonRef {
  kind: PersonKind;
  id: string;
  name: string;
}

/**
 * Resolve a {kind, id} selection to exactly one ACTIVE person of THIS store. IDs are only looked up in
 * the table their kind names, so ids from different tables can never be confused.
 */
export async function resolvePerson(
  db: Prisma.TransactionClient | PrismaService,
  tenantId: string,
  ref: { kind: PersonKind; id: string },
  label: string,
): Promise<PersonRef> {
  const found =
    ref.kind === 'EMPLOYEE'
      ? await db.employee.findFirst({ where: { id: ref.id, tenantId, deletedAt: null, isActive: true }, select: { fullName: true } }).then((e) => e && e.fullName)
      : ref.kind === 'PARTNER'
        ? await db.partner.findFirst({ where: { id: ref.id, tenantId, deletedAt: null, isActive: true }, select: { name: true } }).then((p) => p && p.name)
        : await db.teamPerson.findFirst({ where: { id: ref.id, tenantId, isActive: true, archivedAt: null }, select: { displayName: true } }).then((p) => p && p.displayName);
  if (!found) throw new BadRequestException(`${label}: choose an active person of this store`);
  return { kind: ref.kind, id: ref.id, name: found };
}

/** The CashTransaction columns for one side (paidBy / receivedBy) — exactly one FK set, plus snapshots */
export function personColumns(side: 'paidBy' | 'receivedBy', ref: PersonRef | undefined) {
  if (!ref) return {};
  return {
    [`${side}EmployeeId`]: ref.kind === 'EMPLOYEE' ? ref.id : null,
    [`${side}PartnerId`]: ref.kind === 'PARTNER' ? ref.id : null,
    [`${side}PersonId`]: ref.kind === 'PERSON' ? ref.id : null,
    [`${side}Kind`]: ref.kind,
    [`${side}Name`]: ref.name,
  };
}
