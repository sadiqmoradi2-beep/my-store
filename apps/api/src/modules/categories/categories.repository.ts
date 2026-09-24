import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, deletedAt: null },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.category.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { children: { where: { deletedAt: null } } },
    });
  }

  create(tenantId: string, data: Omit<Prisma.CategoryUncheckedCreateInput, 'tenantId'>) {
    return this.prisma.category.create({ data: { ...data, tenantId } });
  }

  update(id: string, data: Prisma.CategoryUncheckedUpdateInput) {
    return this.prisma.category.update({ where: { id }, data });
  }

  countProducts(tenantId: string, categoryId: string) {
    return this.prisma.product.count({ where: { tenantId, categoryId, deletedAt: null } });
  }
}
