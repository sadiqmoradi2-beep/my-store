import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PartnerEntryType } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { recordCashTransaction } from '../cash/cash.service';
import { resolveSessionId } from '../work-sessions/session-link';
import {
  CreateLedgerEntryDto,
  CreatePartnerDto,
  DistributeProfitDto,
  PartnerLedgerQueryDto,
  UpdatePartnerDto,
} from './dto/partner.dto';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const partners = await this.prisma.partner.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    const totals = await this.prisma.partnerLedgerEntry.groupBy({
      by: ['partnerId', 'type'],
      where: { tenantId },
      _sum: { amount: true },
    });
    const byPartner = new Map<string, Record<PartnerEntryType, Prisma.Decimal>>();
    for (const row of totals) {
      const bucket = byPartner.get(row.partnerId) ?? {
        PROFIT: new Prisma.Decimal(0),
        LOSS: new Prisma.Decimal(0),
        WITHDRAWAL: new Prisma.Decimal(0),
        ADJUSTMENT: new Prisma.Decimal(0),
      };
      bucket[row.type] = row._sum.amount ?? new Prisma.Decimal(0);
      byPartner.set(row.partnerId, bucket);
    }
    return partners.map((partner) => {
      const t = byPartner.get(partner.id) ?? {
        PROFIT: new Prisma.Decimal(0),
        LOSS: new Prisma.Decimal(0),
        WITHDRAWAL: new Prisma.Decimal(0),
        ADJUSTMENT: new Prisma.Decimal(0),
      };
      const balance = t.PROFIT.minus(t.LOSS).minus(t.WITHDRAWAL).plus(t.ADJUSTMENT);
      return {
        ...partner,
        balance,
        totalProfit: t.PROFIT,
        totalLoss: t.LOSS,
        totalWithdrawn: t.WITHDRAWAL,
      };
    });
  }

  async get(tenantId: string, id: string) {
    const partner = await this.prisma.partner.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!partner) throw new NotFoundException('Partner not found');
    return partner;
  }

  create(tenantId: string, dto: CreatePartnerDto) {
    return this.prisma.partner.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        sharePercent: dto.sharePercent != null ? new Prisma.Decimal(dto.sharePercent) : undefined,
        notes: dto.notes,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdatePartnerDto) {
    await this.get(tenantId, id);
    return this.prisma.partner.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.sharePercent != null && { sharePercent: new Prisma.Decimal(dto.sharePercent) }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.get(tenantId, id);
    const used = await this.prisma.partnerLedgerEntry.count({ where: { partnerId: id } });
    if (used > 0) {
      throw new UnprocessableEntityException('Partner has ledger entries on record — deactivate it instead');
    }
    return this.prisma.partner.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async ledger(tenantId: string, query: PartnerLedgerQueryDto) {
    const where = { tenantId, ...(query.partnerId && { partnerId: query.partnerId }) };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.partnerLedgerEntry.findMany({
        where,
        skip,
        take: query.limit,
        include: { partner: { select: { name: true } }, performedBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.partnerLedgerEntry.count({ where }),
    ]);
    const items = rows.map(({ partner, performedBy, ...entry }) => ({
      ...entry,
      partnerName: partner.name,
      performedByName: performedBy.fullName,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /** Record a ledger entry — a WITHDRAWAL with a registerId also deducts the actual cash payout from that register */
  async addLedgerEntry(tenantId: string, userId: string, partnerId: string, dto: CreateLedgerEntryDto) {
    const partner = await this.get(tenantId, partnerId);
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.partnerLedgerEntry.create({
        data: {
          tenantId,
          partnerId,
          type: dto.type,
          amount,
          period: dto.period,
          method: dto.method,
          note: dto.note,
          receiptUrl: dto.receiptUrl,
          performedById: userId,
        },
      });
      if (dto.type === 'WITHDRAWAL' && dto.registerId) {
        await recordCashTransaction(tx, {
          tenantId,
          userId,
          registerId: dto.registerId,
          type: 'EXPENSE',
          amount,
          category: 'Partner withdrawal',
          note: `Withdrawal by ${partner.name}`,
          referenceType: 'partner',
          referenceId: entry.id,
          sessionId: await resolveSessionId(tx, tenantId, userId, dto.sessionId),
        });
      }
      return entry;
    });
  }

  /** Preview each active partner's share of a total profit/loss figure, proportional to sharePercent */
  async previewDistribution(tenantId: string, dto: DistributeProfitDto) {
    const partners = await this.prisma.partner.findMany({
      where: { tenantId, deletedAt: null, isActive: true, sharePercent: { not: null } },
      orderBy: { name: 'asc' },
    });
    const total = new Prisma.Decimal(dto.totalAmount);
    return partners.map((partner) => {
      const share = partner.sharePercent!;
      const amount = total.times(share).dividedBy(100).toDecimalPlaces(2);
      return {
        partnerId: partner.id,
        partnerName: partner.name,
        sharePercent: share,
        amount,
        method: `${share.toString()}% of ${dto.type === 'PROFIT' ? 'net profit' : 'net loss'}${
          dto.period ? ` (${dto.period})` : ''
        }: ${total.toString()}`,
      };
    });
  }

  /** Apply the distribution preview as ledger entries for every active partner with a share */
  async distribute(tenantId: string, userId: string, dto: DistributeProfitDto) {
    const preview = await this.previewDistribution(tenantId, dto);
    if (preview.length === 0) {
      throw new UnprocessableEntityException('No active partners with a share percentage to distribute to');
    }
    return this.prisma.$transaction((tx) =>
      Promise.all(
        preview.map((p) =>
          tx.partnerLedgerEntry.create({
            data: {
              tenantId,
              partnerId: p.partnerId,
              type: dto.type,
              amount: p.amount,
              period: dto.period,
              method: p.method,
              performedById: userId,
            },
          }),
        ),
      ),
    );
  }
}
