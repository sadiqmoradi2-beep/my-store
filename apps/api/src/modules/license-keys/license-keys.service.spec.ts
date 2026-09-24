import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { LicenseKeysService } from './license-keys.service';

describe('LicenseKeysService', () => {
  let service: LicenseKeysService;
  let prisma: Record<string, Record<string, jest.Mock>>;

  beforeEach(async () => {
    prisma = {
      licenseKey: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'lk1', status: 'ACTIVE', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => ({ id: 'lk1', ...data })),
      },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [LicenseKeysService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(LicenseKeysService);
  });

  describe('create', () => {
    it('generates a key in the MYST-XXXX-XXXX-XXXX format', async () => {
      const result = await service.create('admin1', {});
      expect(result.key).toMatch(/^MYST-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(prisma.licenseKey.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ createdById: 'admin1' }) }),
      );
    });

    it('stores the optional note', async () => {
      const result = await service.create('admin1', { note: 'For Ahmad\'s new branch' });
      expect((result as { note?: string }).note).toBe('For Ahmad\'s new branch');
    });

    it('retries on a key collision and eventually succeeds', async () => {
      prisma.licenseKey.create
        .mockRejectedValueOnce(new Error('unique constraint'))
        .mockImplementationOnce(({ data }) => ({ id: 'lk2', status: 'ACTIVE', ...data }));
      const result = await service.create('admin1', {});
      expect(prisma.licenseKey.create).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('lk2');
    });

    it('exhausts all retries → 409', async () => {
      prisma.licenseKey.create.mockRejectedValue(new Error('unique constraint'));
      await expect(service.create('admin1', {})).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.licenseKey.create).toHaveBeenCalledTimes(10);
    });
  });

  describe('revoke', () => {
    it('key not found → 404', async () => {
      prisma.licenseKey.findUnique.mockResolvedValue(null);
      await expect(service.revoke('missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.licenseKey.update).not.toHaveBeenCalled();
    });

    it('already-used key → 409, cannot revoke', async () => {
      prisma.licenseKey.findUnique.mockResolvedValue({ id: 'lk1', status: 'USED' });
      await expect(service.revoke('lk1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.licenseKey.update).not.toHaveBeenCalled();
    });

    it('active key → marked REVOKED', async () => {
      prisma.licenseKey.findUnique.mockResolvedValue({ id: 'lk1', status: 'ACTIVE' });
      await service.revoke('lk1');
      expect(prisma.licenseKey.update).toHaveBeenCalledWith({
        where: { id: 'lk1' },
        data: { status: 'REVOKED' },
      });
    });
  });

  describe('list', () => {
    it('flattens createdBy/usedByTenant into plain name fields', async () => {
      prisma.licenseKey.findMany.mockResolvedValue([
        {
          id: 'lk1',
          key: 'MYST-AAAA-BBBB-CCCC',
          status: 'USED',
          createdBy: { fullName: 'Super Admin' },
          usedByTenant: { name: 'Demo Store' },
        },
        {
          id: 'lk2',
          key: 'MYST-DDDD-EEEE-FFFF',
          status: 'ACTIVE',
          createdBy: { fullName: 'Super Admin' },
          usedByTenant: null,
        },
      ]);
      const result = await service.list();
      expect(result[0]).toEqual(
        expect.objectContaining({ createdByName: 'Super Admin', usedByTenantName: 'Demo Store' }),
      );
      expect(result[1]).toEqual(
        expect.objectContaining({ createdByName: 'Super Admin', usedByTenantName: null }),
      );
    });
  });
});
