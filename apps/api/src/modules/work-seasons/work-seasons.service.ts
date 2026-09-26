import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCapitalEntryDto, CreateSeasonDto } from './dto/work-season.dto';

@Injectable()
export class WorkSeasonsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const seasons = await this.prisma.workSeason.findMany({
      where: { tenantId },
      orderBy: { startsAt: 'desc' },
    });
    const sums = await this.prisma.capitalEntry.groupBy({
      by: ['seasonId', 'type'],
      where: { tenantId },
      _sum: { amount: true },
    });
    const zero = new Prisma.Decimal(0);
    const sumOf = (seasonId: string, type: 'DEPOSIT' | 'WITHDRAWAL') =>
      sums.find((s) => s.seasonId === seasonId && s.type === type)?._sum.amount ?? zero;
    return seasons.map((season) => ({
      ...season,
      capitalIn: sumOf(season.id, 'DEPOSIT'),
      capitalOut: sumOf(season.id, 'WITHDRAWAL'),
    }));
  }

  async get(tenantId: string, id: string) {
    const season = await this.prisma.workSeason.findFirst({
      where: { id, tenantId },
      include: {
        entries: {
          include: { performedBy: { select: { fullName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!season) throw new NotFoundException('Work season not found');
    const { entries, ...rest } = season;
    return {
      ...rest,
      entries: entries.map(({ performedBy, ...entry }) => ({
        ...entry,
        performedByName: performedBy.fullName,
      })),
    };
  }

  async create(tenantId: string, dto: CreateSeasonDto) {
    const open = await this.prisma.workSeason.findFirst({ where: { tenantId, status: 'OPEN' } });
    if (open) throw new ConflictException('An open work season already exists — close it first');

    const openingCapital =
      dto.openingCapital !== undefined
        ? new Prisma.Decimal(dto.openingCapital)
        : await this.previousSeasonClosingCapital(tenantId);

    return this.prisma.workSeason.create({
      data: {
        tenantId,
        name: dto.name,
        ...(dto.startsAt && { startsAt: new Date(dto.startsAt) }),
        openingCapital,
        openingCash: new Prisma.Decimal(dto.openingCash ?? 0),
        currency: dto.currency ?? 'USDT',
      },
    });
  }

  /** Remaining capital from the most recently closed season (openingCapital + capitalIn − capitalOut) — carried forward as the default for a new season, since capital isn't reset between seasons */
  private async previousSeasonClosingCapital(tenantId: string): Promise<Prisma.Decimal> {
    const last = await this.prisma.workSeason.findFirst({
      where: { tenantId, status: 'CLOSED' },
      orderBy: { endsAt: 'desc' },
    });
    if (!last) return new Prisma.Decimal(0);
    const sums = await this.prisma.capitalEntry.groupBy({
      by: ['type'],
      where: { tenantId, seasonId: last.id },
      _sum: { amount: true },
    });
    const zero = new Prisma.Decimal(0);
    const sumOf = (type: 'DEPOSIT' | 'WITHDRAWAL') => sums.find((s) => s.type === type)?._sum.amount ?? zero;
    return last.openingCapital.add(sumOf('DEPOSIT')).sub(sumOf('WITHDRAWAL'));
  }

  async addEntry(tenantId: string, userId: string, seasonId: string, dto: CreateCapitalEntryDto) {
    const season = await this.get(tenantId, seasonId);
    if (season.status !== 'OPEN') {
      throw new UnprocessableEntityException('The work season is closed');
    }
    return this.prisma.capitalEntry.create({
      data: {
        tenantId,
        seasonId,
        type: dto.type,
        amount: new Prisma.Decimal(dto.amount),
        note: dto.note,
        performedById: userId,
      },
    });
  }

  /** Close the season: compute the end-of-season report and record a snapshot */
  async close(tenantId: string, id: string) {
    const season = await this.get(tenantId, id);
    if (season.status !== 'OPEN') {
      throw new UnprocessableEntityException('The work season is already closed');
    }
    const endsAt = new Date();
    const report = await this.buildReport(tenantId, id, season.startsAt, endsAt);
    return this.prisma.workSeason.update({
      where: { id },
      data: { status: 'CLOSED', endsAt, closingReport: report },
    });
  }

  private async buildReport(tenantId: string, seasonId: string, from: Date, to: Date) {
    const range = { gte: from, lte: to };
    const [sales, expenses, capital] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId, createdAt: range },
        select: { total: true, cost: true },
      }),
      this.prisma.cashTransaction.aggregate({
        where: { tenantId, type: 'EXPENSE', createdAt: range },
        _sum: { amount: true },
      }),
      this.prisma.capitalEntry.groupBy({
        by: ['type'],
        where: { tenantId, seasonId },
        _sum: { amount: true },
      }),
    ]);
    const zero = new Prisma.Decimal(0);
    const salesTotal = sales.reduce((sum, o) => sum.add(o.total), zero);
    const salesCost = sales.reduce((sum, o) => sum.add(o.cost), zero);
    const capitalOf = (type: 'DEPOSIT' | 'WITHDRAWAL') =>
      capital.find((c) => c.type === type)?._sum.amount ?? zero;
    return {
      salesTotal: salesTotal.toString(),
      salesCost: salesCost.toString(),
      profit: salesTotal.sub(salesCost).toString(),
      salesCount: sales.length,
      expensesTotal: (expenses._sum.amount ?? zero).toString(),
      capitalIn: capitalOf('DEPOSIT').toString(),
      capitalOut: capitalOf('WITHDRAWAL').toString(),
    };
  }
}
