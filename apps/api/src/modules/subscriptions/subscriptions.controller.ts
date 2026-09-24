import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { BillingCycle, PlanCode } from '@prisma/client';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { SubscriptionsService } from './subscriptions.service';

class ChangePlanDto {
  @IsIn(['FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE'])
  planCode!: PlanCode;

  @IsIn(['ONLINE', 'CASH'])
  paymentMethod!: 'ONLINE' | 'CASH';

  /** Only for paymentMethod=ONLINE — confirmed payment gateway intent */
  @IsOptional()
  @IsString()
  gatewayIntentId?: string;

  /** Defaults to MONTHLY; YEARLY only if the plan has a priceYearly */
  @IsOptional()
  @IsIn(['MONTHLY', 'YEARLY'])
  billingCycle?: BillingCycle;
}

class UpdatePlanConfigDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsNumber()
  priceYearly?: number | null;
}

@ApiTags('subscription')
@ApiBearerAuth()
@Controller('subscription')
@RequirePermissions(PERMISSIONS.SUBSCRIPTION_MANAGE)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  current(@TenantId() tenantId: string) {
    return this.subscriptionsService.current(tenantId);
  }

  @Get('plans')
  plans() {
    return this.subscriptionsService.plans();
  }

  /** List of pending plan-change requests — for the platform admin panel */
  @Get('pending')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTION_APPROVE)
  pending() {
    return this.subscriptionsService.pendingRequests();
  }

  @Post('change')
  change(@TenantId() tenantId: string, @Body() dto: ChangePlanDto) {
    return this.subscriptionsService.changePlan(tenantId, dto.planCode, {
      paymentMethod: dto.paymentMethod,
      gatewayIntentId: dto.gatewayIntentId,
      billingCycle: dto.billingCycle,
    });
  }

  /**
   * Approve/reject a specific store's pending plan-change request — platform admin only (SUPER_ADMIN);
   * since this role has no tenantId of its own, unlike the rest of this controller it uses a route
   * parameter instead of @TenantId(). Currently called via the API with no UI.
   */
  @Post(':tenantId/approve')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTION_APPROVE)
  approve(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.approvePending(tenantId);
  }

  @Post(':tenantId/reject')
  @RequirePermissions(PERMISSIONS.SUBSCRIPTION_APPROVE)
  reject(@Param('tenantId') tenantId: string) {
    return this.subscriptionsService.rejectPending(tenantId);
  }

  /** Global plan configuration (active/inactive, requires approval, yearly price) — platform admin only */
  @Patch('plans/:code')
  @RequirePermissions(PERMISSIONS.PLANS_MANAGE)
  updatePlanConfig(@Param('code') code: PlanCode, @Body() dto: UpdatePlanConfigDto) {
    return this.subscriptionsService.updatePlanConfig(code, dto);
  }
}
