import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BranchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId, isActive: true },
      include: { warehouses: { where: { isActive: true } } },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.branch.findFirst({
      where: { id, tenantId, isActive: true },
      include: { warehouses: { where: { isActive: true } } },
    });
  }

  createWithDefaultWarehouse(tenantId: string, data: Omit<Prisma.BranchUncheckedCreateInput, 'tenantId'>) {
    return this.prisma.branch.create({
      data: {
        ...data,
        tenantId,
        warehouses: { create: { tenantId, name: `${data.name} Warehouse`, isDefault: true } },
      },
      include: { warehouses: true },
    });
  }

  update(id: string, data: Prisma.BranchUncheckedUpdateInput) {
    return this.prisma.branch.update({
      where: { id },
      data,
      include: { warehouses: { where: { isActive: true } } },
    });
  }

  createWarehouse(data: Prisma.WarehouseUncheckedCreateInput) {
    return this.prisma.warehouse.create({ data });
  }
}
