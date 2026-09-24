import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginationMeta } from '../../common/dto/pagination-query.dto';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { ListFeedbackQueryDto } from './dto/list-feedback-query.dto';
import { UpdateFeedbackDto } from './dto/update-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  create(tenantId: string, userId: string, dto: CreateFeedbackDto) {
    return this.prisma.platformFeedback.create({
      data: { tenantId, submittedByUserId: userId, ...dto },
    });
  }

  async listMine(tenantId: string, query: ListFeedbackQueryDto) {
    const where = { tenantId };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
      this.prisma.platformFeedback.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.platformFeedback.count({ where }),
    ]);
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /** List all platform feedback — FEEDBACK_MANAGE only (platform admin) */
  async listAll(query: ListFeedbackQueryDto) {
    const where = {
      ...(query.status && { status: query.status }),
      ...(query.type && { type: query.type }),
      ...(query.search && {
        OR: [
          { subject: { contains: query.search, mode: 'insensitive' as const } },
          { body: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const skip = (query.page - 1) * query.limit;
    const [rows, total] = await Promise.all([
      this.prisma.platformFeedback.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.platformFeedback.count({ where }),
    ]);

    const tenantIds = [...new Set(rows.map((r) => r.tenantId))];
    const userIds = [...new Set(rows.map((r) => r.submittedByUserId))];
    const [tenants, users] = await Promise.all([
      this.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } }),
    ]);
    const tenantNames = new Map(tenants.map((t) => [t.id, t.name]));
    const userNames = new Map(users.map((u) => [u.id, u.fullName]));

    const items = rows.map((row) => ({
      ...row,
      tenantName: tenantNames.get(row.tenantId) ?? null,
      submitterName: userNames.get(row.submittedByUserId) ?? null,
    }));
    return { items, meta: paginationMeta(query.page, query.limit, total) };
  }

  /** Update status/internal note — FEEDBACK_MANAGE only (platform admin) */
  async update(id: string, dto: UpdateFeedbackDto) {
    const feedback = await this.prisma.platformFeedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Feedback not found');
    return this.prisma.platformFeedback.update({ where: { id }, data: dto });
  }
}
