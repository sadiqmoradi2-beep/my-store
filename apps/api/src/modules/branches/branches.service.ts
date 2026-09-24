import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './dto/create-branch.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { BranchesRepository } from './branches.repository';
import { assertPlanLimit } from '../subscriptions/subscriptions.service';

@Injectable()
export class BranchesService {
  constructor(
    private readonly repo: BranchesRepository,
    private readonly prisma: PrismaService,
  ) {}

  list(tenantId: string) {
    return this.repo.findMany(tenantId);
  }

  async get(tenantId: string, id: string) {
    const branch = await this.repo.findById(tenantId, id);
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async create(tenantId: string, dto: CreateBranchDto) {
    await assertPlanLimit(this.prisma, tenantId, 'branches');
    return this.repo.createWithDefaultWarehouse(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto) {
    await this.get(tenantId, id);
    return this.repo.update(id, dto);
  }

  async remove(tenantId: string, id: string) {
    const branch = await this.get(tenantId, id);
    if (branch.isMain) {
      throw new BadRequestException('The main branch cannot be deleted');
    }
    await this.repo.update(id, { isActive: false });
    return { deleted: true };
  }

  /** Create an additional warehouse for a branch — a branch can have multiple warehouses */
  async createWarehouse(tenantId: string, branchId: string, dto: CreateWarehouseDto) {
    await this.get(tenantId, branchId);
    return this.repo.createWarehouse({
      tenantId,
      branchId,
      name: dto.name,
      phone: dto.phone,
      ownerName: dto.ownerName,
    });
  }
}
