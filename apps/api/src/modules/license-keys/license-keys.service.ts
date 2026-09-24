import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLicenseKeyDto } from './dto/license-key.dto';

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excludes look-alikes (0/O, 1/I)

function randomGroup(length: number): string {
  return Array.from({ length }, () => KEY_ALPHABET[Math.floor(Math.random() * KEY_ALPHABET.length)]).join('');
}

/** e.g. "MYST-7K2P-QX9R-4WJH" */
function generateLicenseKey(): string {
  return ['MYST', randomGroup(4), randomGroup(4), randomGroup(4)].join('-');
}

@Injectable()
export class LicenseKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.licenseKey.findMany({
      include: {
        createdBy: { select: { fullName: true } },
        usedByTenant: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(({ createdBy, usedByTenant, ...key }) => ({
      ...key,
      createdByName: createdBy.fullName,
      usedByTenantName: usedByTenant?.name ?? null,
    }));
  }

  /** Generate a new one-time activation key for a new store to register with */
  async create(createdById: string, dto: CreateLicenseKeyDto) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return await this.prisma.licenseKey.create({
          data: { key: generateLicenseKey(), note: dto.note, createdById },
        });
      } catch {
        // key collision — extremely unlikely, retry with a freshly generated key
      }
    }
    throw new ConflictException('Unable to generate a unique license key — please try again');
  }

  /** Revoke an unused key so it can no longer be redeemed */
  async revoke(id: string) {
    const key = await this.prisma.licenseKey.findUnique({ where: { id } });
    if (!key) throw new NotFoundException('License key not found');
    if (key.status === 'USED') {
      throw new ConflictException('This key has already been used and cannot be revoked');
    }
    return this.prisma.licenseKey.update({ where: { id }, data: { status: 'REVOKED' } });
  }
}
