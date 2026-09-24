import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { ModuleAccessService } from './module-access.service';
import { TenantModulesService } from './tenant-modules.service';

/**
 * Uses the real MODULE_REGISTRY (@my-store/shared); relationships relevant to these tests:
 * products: isCore=true
 * inventory: isCore=true
 * suppliers: isCore=false, dependsOn=['inventory'], minPlan=BUSINESS
 * returns:   isCore=false, dependsOn=['suppliers','inventory'], minPlan=FREE
 */
describe('TenantModulesService.setEnabled', () => {
  let service: TenantModulesService;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let moduleAccess: { stateOf: jest.Mock; invalidate: jest.Mock };

  beforeEach(async () => {
    moduleAccess = {
      stateOf: jest.fn().mockResolvedValue({ planRank: 1, disabledKeys: new Set<string>() }),
      invalidate: jest.fn(),
    };
    prisma = {
      module: { findUnique: jest.fn().mockResolvedValue({ id: 'mod-suppliers' }) },
      tenantModule: { upsert: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TenantModulesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ModuleAccessService, useValue: moduleAccess },
      ],
    }).compile();
    service = moduleRef.get(TenantModulesService);
  });

  it('disabling a core module → error (without checking dependencies)', async () => {
    await expect(service.setEnabled('t1', 'products', false)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(moduleAccess.stateOf).not.toHaveBeenCalled();
    expect(prisma.tenantModule.upsert).not.toHaveBeenCalled();
  });

  it('enabling a module whose dependency is disabled → error', async () => {
    moduleAccess.stateOf.mockResolvedValue({
      planRank: 1,
      disabledKeys: new Set(['suppliers']),
    });
    await expect(service.setEnabled('t1', 'returns', true)).rejects.toThrow(/suppliers/);
    expect(prisma.tenantModule.upsert).not.toHaveBeenCalled();
  });

  it('disabling a module that other enabled modules depend on → error', async () => {
    moduleAccess.stateOf.mockResolvedValue({ planRank: 1, disabledKeys: new Set<string>() });
    await expect(service.setEnabled('t1', 'suppliers', false)).rejects.toThrow(/returns/);
    expect(prisma.tenantModule.upsert).not.toHaveBeenCalled();
  });

  it('enabling a module above the current plan → error', async () => {
    moduleAccess.stateOf.mockResolvedValue({ planRank: 0, disabledKeys: new Set<string>() }); // FREE
    await expect(service.setEnabled('t1', 'suppliers', true)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.tenantModule.upsert).not.toHaveBeenCalled();
  });

  it('successful enable: dependencies enabled and plan sufficient → upsert + invalidate', async () => {
    moduleAccess.stateOf.mockResolvedValue({ planRank: 1, disabledKeys: new Set<string>() });
    await service.setEnabled('t1', 'suppliers', true);
    expect(prisma.tenantModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_moduleId: { tenantId: 't1', moduleId: 'mod-suppliers' } },
        create: { tenantId: 't1', moduleId: 'mod-suppliers', enabled: true },
        update: { enabled: true },
      }),
    );
    expect(moduleAccess.invalidate).toHaveBeenCalledWith('t1');
  });

  it('successful disable: no active dependents → upsert with enabled=false', async () => {
    moduleAccess.stateOf.mockResolvedValue({ planRank: 1, disabledKeys: new Set<string>() });
    await service.setEnabled('t1', 'returns', false);
    expect(prisma.tenantModule.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { enabled: false } }),
    );
  });

  it('non-existent module key → 404', async () => {
    await expect(service.setEnabled('t1', 'not-a-real-module', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('module not seeded in the database → 404', async () => {
    moduleAccess.stateOf.mockResolvedValue({ planRank: 1, disabledKeys: new Set<string>() });
    prisma.module.findUnique.mockResolvedValue(null);
    await expect(service.setEnabled('t1', 'suppliers', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.tenantModule.upsert).not.toHaveBeenCalled();
  });
});
