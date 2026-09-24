import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(
    tenantId: string,
    skip: number,
    take: number,
    status?: OrderStatus,
    branchId?: string,
  ) {
    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(status && { status }),
      ...(branchId && { branchId }),
    };
    return Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          branch: { select: { name: true } },
          items: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);
  }

  findById(tenantId: string, id: string) {
    return this.prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        branch: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        approvedBy: { select: { fullName: true } },
        items: true,
        statusHistory: {
          include: { changedBy: { select: { fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  findBranchWithDefaultWarehouse(tenantId: string, branchId: string) {
    return this.prisma.branch.findFirst({
      where: { id: branchId, tenantId, isActive: true },
      include: { warehouses: { where: { isDefault: true, isActive: true }, take: 1 } },
    });
  }

  findProductsForOrder(tenantId: string, productIds: string[]) {
    return this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds }, deletedAt: null, isActive: true },
    });
  }
}
