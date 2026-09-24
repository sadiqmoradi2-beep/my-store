import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MODULE_REGISTRY, PLAN_RANK } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from './module-access.service';

@Injectable()
export class TenantModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleAccess: ModuleAccessService,
  ) {}

  /** Full status of all modules, for the management page */
  async list(tenantId: string) {
    const state = await this.moduleAccess.stateOf(tenantId);
    return MODULE_REGISTRY.map((m) => ({
      key: m.key,
      name: m.name,
      version: m.version,
      isCore: m.isCore,
      dependsOn: m.dependsOn,
      minPlan: m.minPlan,
      enabled: m.isCore || !state.disabledKeys.has(m.key),
      allowedByPlan: state.planRank >= PLAN_RANK[m.minPlan],
    }));
  }

  /** Keys of the available modules — used to hide menus on the front end */
  async enabledKeys(tenantId: string) {
    const state = await this.moduleAccess.stateOf(tenantId);
    return MODULE_REGISTRY.filter(
      (m) =>
        m.isCore ||
        (!state.disabledKeys.has(m.key) && state.planRank >= PLAN_RANK[m.minPlan]),
    ).map((m) => m.key);
  }

  async setEnabled(tenantId: string, key: string, enabled: boolean) {
    const definition = MODULE_REGISTRY.find((m) => m.key === key);
    if (!definition) throw new NotFoundException('Module not found');
    if (definition.isCore) throw new BadRequestException('Core modules cannot be disabled');

    const state = await this.moduleAccess.stateOf(tenantId);

    if (enabled) {
      if (state.planRank < PLAN_RANK[definition.minPlan]) {
        throw new BadRequestException('The store\'s current plan does not allow this module — upgrade your plan');
      }
      const missingDeps = definition.dependsOn.filter((dep) => {
        const depDef = MODULE_REGISTRY.find((m) => m.key === dep);
        return depDef && !depDef.isCore && state.disabledKeys.has(dep);
      });
      if (missingDeps.length) {
        throw new BadRequestException(`First enable the dependencies: ${missingDeps.join(', ')}`);
      }
    } else {
      const dependents = MODULE_REGISTRY.filter(
        (m) =>
          m.dependsOn.includes(key) && (m.isCore || !state.disabledKeys.has(m.key)),
      );
      if (dependents.length) {
        throw new BadRequestException(
          `First disable the dependent modules: ${dependents.map((d) => d.key).join(', ')}`,
        );
      }
    }

    const moduleRow = await this.prisma.module.findUnique({ where: { key } });
    if (!moduleRow) throw new NotFoundException('Module has not been seeded in the database');
    await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId: moduleRow.id } },
      create: { tenantId, moduleId: moduleRow.id, enabled },
      update: { enabled },
    });
    this.moduleAccess.invalidate(tenantId);
    return this.list(tenantId);
  }
}
