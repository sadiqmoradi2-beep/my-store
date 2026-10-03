import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '@my-store/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/decorators/current-user.decorator';

const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  active: boolean;
  expiresAt: number;
}

/**
 * The JWT signature/expiry alone can't reflect a deletion/deactivation that happened after the
 * token was issued — an access token is normally trusted for its full TTL. This re-checks the
 * live User row (deletedAt/status), short-cached per user, so a deleted/deactivated account's
 * existing session is cut off within ~30s instead of staying valid for the whole access-token
 * lifetime (15m).
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    if (!payload?.sub) throw new UnauthorizedException();
    if (!(await this.isActive(payload.sub))) throw new UnauthorizedException();
    return { userId: payload.sub, ...payload };
  }

  private async isActive(userId: string): Promise<boolean> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.active;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true, status: true, tenant: { select: { isActive: true } } },
    });
    // A suspended store (Tenant.isActive=false) cuts off all its users the same way
    const active = !!user && !user.deletedAt && user.status === 'ACTIVE' && user.tenant?.isActive !== false;
    this.cache.set(userId, { active, expiresAt: Date.now() + CACHE_TTL_MS });
    return active;
  }
}
