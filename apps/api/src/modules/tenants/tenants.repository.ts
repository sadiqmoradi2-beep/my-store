import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: { include: { plan: true } } },
    });
  }

  update(tenantId: string, data: Prisma.TenantUpdateInput) {
    return this.prisma.tenant.update({ where: { id: tenantId }, data });
  }

  /** List all stores — platform admin only (SUPER_ADMIN console) */
  findManyForAdmin(search: string | undefined, skip: number, take: number) {
    return this.prisma.tenant.findMany({
      where: search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] }
        : undefined,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
    });
  }

  countForAdmin(search: string | undefined) {
    return this.prisma.tenant.count({
      where: search
        ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] }
        : undefined,
    });
  }

  findByIdForAdmin(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      include: { subscription: { include: { plan: true, pendingPlan: true } } },
    });
  }

  subscriptionHistory(tenantId: string) {
    return this.prisma.subscriptionHistory.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Lightweight usage-behavior signals — just the admin's last login and total order count, no heavy analysis */
  async behaviorSignals(tenantId: string) {
    const [lastAdminLogin, totalOrders] = await Promise.all([
      this.prisma.user.aggregate({
        where: { tenantId, role: { key: 'ADMIN' } },
        _max: { lastLoginAt: true },
      }),
      this.prisma.order.count({ where: { tenantId } }),
    ]);
    return { lastAdminLoginAt: lastAdminLogin._max.lastLoginAt, totalOrders };
  }
}
