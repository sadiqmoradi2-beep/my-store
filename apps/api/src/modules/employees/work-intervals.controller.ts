import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequireModule } from '../../common/decorators/require-module.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { ApproveIntervalDto, HourlyPayDto, RejectIntervalDto, WorkIntervalRangeDto } from './dto/work-interval.dto';
import { WorkIntervalsService } from './work-intervals.service';

/** Hourly payroll: review recorded work and pay approved hours */
@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees/:employeeId')
@RequireModule('employees')
export class WorkIntervalsController {
  constructor(private readonly service: WorkIntervalsService) {}

  @Get('work-intervals')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  list(@TenantId() tenantId: string, @Param('employeeId') employeeId: string, @Query() range: WorkIntervalRangeDto) {
    return this.service.list(tenantId, employeeId, range);
  }

  /** Pick up new / changed attendance days and work sessions in the range */
  @Post('work-intervals/sync')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  sync(@TenantId() tenantId: string, @Param('employeeId') employeeId: string, @Body() range: WorkIntervalRangeDto) {
    return this.service.sync(tenantId, employeeId, range);
  }

  @Post('work-intervals/:id/approve')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  approve(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: ApproveIntervalDto,
  ) {
    return this.service.approve(tenantId, user.userId, employeeId, id, dto);
  }

  @Post('work-intervals/:id/reject')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  reject(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('employeeId') employeeId: string,
    @Param('id') id: string,
    @Body() dto: RejectIntervalDto,
  ) {
    return this.service.reject(tenantId, user.userId, employeeId, id, dto);
  }

  @Get('work-intervals/:id/events')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  events(@TenantId() tenantId: string, @Param('employeeId') employeeId: string, @Param('id') id: string) {
    return this.service.events(tenantId, employeeId, id);
  }

  @Get('hourly-pay/preview')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  preview(@TenantId() tenantId: string, @Param('employeeId') employeeId: string, @Query() range: WorkIntervalRangeDto) {
    return this.service.preview(tenantId, employeeId, range);
  }

  @Post('hourly-pay')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  pay(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: HourlyPayDto,
  ) {
    return this.service.pay(tenantId, user.userId, employeeId, dto);
  }
}
