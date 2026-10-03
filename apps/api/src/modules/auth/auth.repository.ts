import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        tenant: { select: { isActive: true, subscription: { select: { status: true } } } },
      },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        tenant: { select: { isActive: true, subscription: { select: { status: true } } } },
      },
    });
  }

  updateRefreshTokenHash(userId: string, hash: string | null) {
    return this.prisma.user.update({ where: { id: userId }, data: { refreshTokenHash: hash } });
  }

  markLogin(userId: string) {
    return this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  updateResetToken(userId: string, hash: string | null, expiresAt: Date | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { resetTokenHash: hash, resetTokenExpiresAt: expiresAt },
    });
  }

  findSystemRole(key: string) {
    return this.prisma.role.findFirst({ where: { tenantId: null, key } });
  }

  findPlan(code: 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE') {
    return this.prisma.plan.findUnique({ where: { code } });
  }

  findCoreModules() {
    return this.prisma.module.findMany({ where: { isCore: true } });
  }

  slugExists(slug: string) {
    return this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  }
}
