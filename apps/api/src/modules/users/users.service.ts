import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ROLES } from '@my-store/shared';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersRepository } from './users.repository';
import { assertPlanLimit } from '../subscriptions/subscriptions.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaService,
  ) {}

  async list(tenantId: string, query: PaginationQueryDto) {
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.repo.findMany(tenantId, skip, query.limit, query.search);
    return {
      items: items.map(sanitize),
      meta: paginationMeta(query.page, query.limit, total),
    };
  }

  async create(tenantId: string, dto: CreateUserDto) {
    await assertPlanLimit(this.prisma, tenantId, 'users');
    if (await this.repo.findByEmail(dto.email)) {
      throw new ConflictException('This email is already registered');
    }
    await this.assertRoleAssignable(tenantId, dto.roleId);
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const { password: _password, ...rest } = dto;
    return sanitize(await this.repo.create({ ...rest, tenantId, passwordHash }));
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) throw new NotFoundException('User not found');
    if (dto.roleId) await this.assertRoleAssignable(tenantId, dto.roleId);

    const { password, ...rest } = dto;
    const data = password
      ? { ...rest, passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS) }
      : rest;
    return sanitize(await this.repo.update(id, data));
  }

  async remove(tenantId: string, id: string, currentUserId: string) {
    if (id === currentUserId) {
      throw new BadRequestException('You cannot delete your own account');
    }
    const existing = await this.repo.findById(tenantId, id);
    if (!existing) throw new NotFoundException('User not found');
    await this.repo.softDelete(id);
    return { deleted: true };
  }

  private async assertRoleAssignable(tenantId: string, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    const assignable =
      role && role.key !== ROLES.SUPER_ADMIN && (role.tenantId === null || role.tenantId === tenantId);
    if (!assignable) {
      throw new BadRequestException('The selected role is not valid');
    }
  }
}

function sanitize<T extends { passwordHash?: string; refreshTokenHash?: string | null }>(user: T) {
  const { passwordHash: _p, refreshTokenHash: _r, ...safe } = user;
  return safe;
}
