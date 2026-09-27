import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { computeCommission } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { recordCashTransaction } from '../cash/cash.service';
import { resolveSessionId } from '../work-sessions/session-link';
import { assertPlanLimit } from '../subscriptions/subscriptions.service';
import { CreateSellerDto, PaySellerSalaryDto, UpdateSellerDto } from './dto/seller.dto';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class SellersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sellers + performance (sales and commission) */
  async list(tenantId: string) {
    const profiles = await this.prisma.sellerProfile.findMany({
      where: { tenantId },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const [saleStats, commissionStats] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ['createdById'],
        where: {
          tenantId,
          createdById: { in: profiles.map((p) => p.userId) },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.commissionEntry.groupBy({
        by: ['sellerProfileId'],
        where: { tenantId },
        _sum: { amount: true },
      }),
    ]);
    const saleByUser = new Map(saleStats.map((s) => [s.createdById, s]));
    const commissionByProfile = new Map(commissionStats.map((s) => [s.sellerProfileId, s]));
    return profiles.map(({ user, ...profile }) => ({
      ...profile,
      fullName: user.fullName,
      email: user.email,
      salesCount: saleByUser.get(profile.userId)?._count._all ?? 0,
      salesTotal: saleByUser.get(profile.userId)?._sum.total ?? new Prisma.Decimal(0),
      commissionTotal:
        commissionByProfile.get(profile.id)?._sum.amount ?? new Prisma.Decimal(0),
    }));
  }

  /** Create a seller profile — either for an existing user, or by creating a brand-new SELLER-role login account */
  async create(tenantId: string, dto: CreateSellerDto) {
    let userId = dto.userId;
    let tempPassword: string | undefined;

    if (userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('User not found');
    } else {
      if (!dto.fullName || !dto.email) {
        throw new BadRequestException(
          'Provide either an existing user, or a full name and email to create a new account',
        );
      }
      if (await this.prisma.user.findUnique({ where: { email: dto.email } })) {
        throw new ConflictException('This email is already registered');
      }
      await assertPlanLimit(this.prisma, tenantId, 'users');
      const role = await this.prisma.role.findFirst({
        where: { tenantId: null, key: 'SELLER', isSystem: true },
        select: { id: true },
      });
      if (!role) throw new NotFoundException('System role SELLER not found');

      tempPassword = randomBytes(9).toString('base64url');
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          phone: dto.phone,
          roleId: role.id,
        },
      });
      userId = user.id;
    }

    const existing = await this.prisma.sellerProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('A seller profile already exists for this user');
    const profile = await this.prisma.sellerProfile.create({
      data: {
        tenantId,
        userId,
        payType: dto.payType ?? 'COMMISSION',
        commissionPercent: new Prisma.Decimal(dto.commissionPercent ?? 0),
        fixedSalaryAmount:
          dto.fixedSalaryAmount != null ? new Prisma.Decimal(dto.fixedSalaryAmount) : undefined,
        notes: dto.notes,
      },
    });
    return tempPassword ? { ...profile, tempPassword } : profile;
  }

  async update(tenantId: string, id: string, dto: UpdateSellerDto) {
    await this.get(tenantId, id);
    return this.prisma.sellerProfile.update({
      where: { id },
      data: {
        ...(dto.payType && { payType: dto.payType }),
        ...(dto.commissionPercent != null && {
          commissionPercent: new Prisma.Decimal(dto.commissionPercent),
        }),
        ...(dto.fixedSalaryAmount != null && {
          fixedSalaryAmount: new Prisma.Decimal(dto.fixedSalaryAmount),
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  /** Pay a seller — a fixed salary, or a commission payout for a commission seller */
  async paySalary(tenantId: string, userId: string, id: string, dto: PaySellerSalaryDto) {
    await this.get(tenantId, id);
    const amount = new Prisma.Decimal(dto.amount);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.sellerSalaryPayment.create({
        data: {
          tenantId,
          sellerProfileId: id,
          amount,
          period: dto.period,
          registerId: dto.registerId,
          note: dto.note,
          receiptImageUrl: dto.receiptImageUrl,
          performedById: userId,
        },
      });
      if (dto.registerId) {
        await recordCashTransaction(tx, {
          tenantId,
          userId,
          registerId: dto.registerId,
          type: 'EXPENSE',
          amount,
          category: 'Seller salary',
          note: `Seller salary — ${dto.period}`,
          referenceType: 'seller_salary',
          referenceId: payment.id,
          sessionId: await resolveSessionId(tx, tenantId, userId, dto.sessionId),
        });
      }
      return payment;
    });
  }

  async salaryPayments(tenantId: string, id: string, query: PaginationQueryDto) {
    await this.get(tenantId, id);
    const where = { tenantId, sellerProfileId: id };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.sellerSalaryPayment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.sellerSalaryPayment.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  async commissions(tenantId: string, id: string, query: PaginationQueryDto) {
    await this.get(tenantId, id);
    const where = { tenantId, sellerProfileId: id };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.commissionEntry.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.commissionEntry.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  private async get(tenantId: string, id: string) {
    const profile = await this.prisma.sellerProfile.findFirst({ where: { id, tenantId } });
    if (!profile) throw new NotFoundException('Seller not found');
    return profile;
  }
}

interface CommissionSale {
  id: string;
  saleNumber: number;
  total: Prisma.Decimal;
  createdById: string;
}

/** Record seller commission for a sale — if the seller has an active commission profile */
export async function recordCommission(
  tx: Prisma.TransactionClient,
  tenantId: string,
  sale: CommissionSale,
) {
  const profile = await tx.sellerProfile.findFirst({
    where: { tenantId, userId: sale.createdById, isActive: true },
    select: { id: true, payType: true, commissionPercent: true },
  });
  if (!profile || profile.payType === 'FIXED_SALARY' || profile.commissionPercent.lte(0)) return null;
  const existing = await tx.commissionEntry.findUnique({
    where: { sellerProfileId_saleId: { sellerProfileId: profile.id, saleId: sale.id } },
  });
  if (existing) return existing;
  const amount = computeCommission(sale.total.toNumber(), profile.commissionPercent.toNumber());
  if (amount <= 0) return null;
  return tx.commissionEntry.create({
    data: {
      tenantId,
      sellerProfileId: profile.id,
      saleId: sale.id,
      saleNumber: sale.saleNumber,
      amount: new Prisma.Decimal(amount),
      percent: profile.commissionPercent,
    },
  });
}
