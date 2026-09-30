import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, skip: number, take: number, search?: string) {
    const where: Prisma.UserWhereInput = {
      tenantId,
      deletedAt: null,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    return Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        include: { role: true, branch: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
  }

  findById(tenantId: string, id: string) {
    return this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { role: true },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  create(data: Prisma.UserUncheckedCreateInput) {
    return this.prisma.user.create({ data, include: { role: true } });
  }

  update(id: string, data: Prisma.UserUncheckedUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, include: { role: true } });
  }

  softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
        refreshTokenHash: null,
        // Frees the email for reuse — email is @unique at the DB level so the live row must vacate it.
        email: `deleted-${Date.now()}-${id}`,
      },
    });
  }
}
