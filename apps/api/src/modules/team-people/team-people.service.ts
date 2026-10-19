import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertRealStoreAdmin } from '../../common/store-admin';
import { CreateTeamPersonDto, UpdateTeamPersonDto } from './dto/team-person.dto';

const clean = (name: string) => name.trim().replace(/\s+/g, ' ');

/**
 * Team → Financial Personnel: people who are neither employees nor partners (no payroll, no login). They are never
 * deleted while transactions point at them — only deactivated.
 */
@Injectable()
export class TeamPeopleService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.teamPerson.findMany({
      where: { tenantId },
      orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { isActive: 'desc' }, { displayName: 'asc' }],
    });
  }

  async create(tenantId: string, dto: CreateTeamPersonDto) {
    const displayName = clean(dto.displayName);
    await this.assertNameFree(tenantId, displayName);
    return this.save(() => this.prisma.teamPerson.create({ data: { tenantId, displayName, notes: dto.notes?.trim() || null } }));
  }

  async update(tenantId: string, id: string, dto: UpdateTeamPersonDto) {
    const person = await this.prisma.teamPerson.findFirst({ where: { id, tenantId } });
    if (!person) throw new NotFoundException('Person not found');
    if (person.archivedAt) throw new UnprocessableEntityException('This person was deleted (archived) and can no longer be changed');
    const displayName = dto.displayName !== undefined ? clean(dto.displayName) : undefined;
    if (displayName && displayName.toLowerCase() !== person.displayName.toLowerCase()) {
      await this.assertNameFree(tenantId, displayName, id);
    }
    return this.save(() =>
      this.prisma.teamPerson.update({
        where: { id },
        data: {
          ...(displayName && { displayName }),
          ...(dto.notes !== undefined && { notes: dto.notes.trim() || null }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      }),
    );
  }

  /**
   * Everyone selectable as Paid By / Who Is Paid: active employees (sellers are employees), active
   * partners and active team people — each from its own table, so nothing is duplicated.
   */
  async directory(tenantId: string) {
    const [employees, partners, people] = await Promise.all([
      this.prisma.employee.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, fullName: true, position: true }, orderBy: { fullName: 'asc' } }),
      this.prisma.partner.findMany({ where: { tenantId, deletedAt: null, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.teamPerson.findMany({ where: { tenantId, isActive: true, archivedAt: null }, select: { id: true, displayName: true }, orderBy: { displayName: 'asc' } }),
    ]);
    return [
      ...employees.map((e) => ({ kind: 'EMPLOYEE' as const, id: e.id, name: e.fullName, detail: e.position })),
      ...partners.map((p) => ({ kind: 'PARTNER' as const, id: p.id, name: p.name, detail: null })),
      ...people.map((p) => ({ kind: 'PERSON' as const, id: p.id, name: p.displayName, detail: null })),
    ];
  }

  /**
   * Delete (real Store Admin only). Someone named on any transaction or transfer is archived instead: hidden from
   * new selections, name and links kept, so history never changes. Nobody referenced → removed for good.
   */
  async remove(tenantId: string, userId: string, id: string) {
    await assertRealStoreAdmin(this.prisma, tenantId, userId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TeamPerson" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const person = await tx.teamPerson.findFirst({ where: { id, tenantId } });
      if (!person) throw new NotFoundException('Person not found');
      if (person.archivedAt) return { result: 'ARCHIVED' as const, references: null, person };
      const [transactions, transfers] = await Promise.all([
        tx.cashTransaction.count({
          where: { tenantId, OR: [{ paidByPersonId: id }, { receivedByPersonId: id }, { transferredByPersonId: id }] },
        }),
        tx.cashTransfer.count({ where: { tenantId, transferredByPersonId: id } }),
      ]);
      if (transactions + transfers > 0) {
        const archived = await tx.teamPerson.update({ where: { id }, data: { archivedAt: new Date(), isActive: false } });
        return { result: 'ARCHIVED' as const, references: { transactions, transfers }, person: archived };
      }
      await tx.teamPerson.delete({ where: { id } });
      return { result: 'DELETED' as const, references: { transactions: 0, transfers: 0 }, person };
    });
  }

  private async assertNameFree(tenantId: string, displayName: string, exceptId?: string) {
    const taken = await this.prisma.teamPerson.findFirst({
      where: { tenantId, archivedAt: null, displayName: { equals: displayName, mode: 'insensitive' }, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true },
    });
    if (taken) throw new ConflictException('A person with this name is already registered');
  }

  /** The DB unique index (store + case-insensitive name) is the final guard against a simultaneous duplicate */
  private async save<T>(op: () => Promise<T>) {
    try {
      return await op();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A person with this name is already registered');
      }
      throw e;
    }
  }
}
