import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import {
  AttendanceQueryDto,
  CreateEmployeeDto,
  EndShiftDto,
  MarkAttendanceDto,
  MarkSalaryPaidDto,
  PaySalaryDto,
  SalaryListQueryDto,
  StartShiftDto,
  UpdateEmployeeDto,
} from './dto/employee.dto';
import { PaySellerSalaryDto } from '../sellers/dto/seller.dto';
import { EmployeesService } from './employees.service';
import { RequireModule } from '../../common/decorators/require-module.decorator';

@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
@RequireModule('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  list(@TenantId() tenantId: string) {
    return this.employeesService.list(tenantId);
  }

  @Get('salary-payments')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  salaryPayments(@TenantId() tenantId: string, @Query() query: SalaryListQueryDto) {
    return this.employeesService.salaryPayments(tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  create(@TenantId() tenantId: string, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  remove(@TenantId() tenantId: string, @CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.employeesService.remove(tenantId, user.userId, id);
  }

  @Post(':id/salary-payments')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  paySalary(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: PaySalaryDto,
  ) {
    return this.employeesService.paySalary(tenantId, user.userId, id, dto);
  }

  @Patch(':id/salary-payments/:paymentId/mark-paid')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  markSalaryPaid(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: MarkSalaryPaidDto,
  ) {
    return this.employeesService.markSalaryPaid(tenantId, user.userId, id, paymentId, dto.registerId);
  }

  @Post(':id/commission-payments')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  payCommission(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: PaySellerSalaryDto,
  ) {
    return this.employeesService.payCommission(tenantId, user.userId, id, dto);
  }

  @Get(':id/shifts')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  shifts(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.employeesService.shifts(tenantId, id);
  }

  @Post(':id/shifts')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  startShift(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: StartShiftDto,
  ) {
    return this.employeesService.startShift(tenantId, user.userId, id, dto);
  }

  @Patch(':id/shifts/:shiftId')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  endShift(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('shiftId') shiftId: string,
    @Body() dto: EndShiftDto,
  ) {
    return this.employeesService.endShift(tenantId, user.userId, id, shiftId, dto);
  }

  @Get(':id/attendance')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_READ)
  attendance(@TenantId() tenantId: string, @Param('id') id: string, @Query() query: AttendanceQueryDto) {
    return this.employeesService.attendance(tenantId, id, query);
  }

  @Post(':id/attendance')
  @RequirePermissions(PERMISSIONS.EMPLOYEES_MANAGE)
  markAttendance(
    @TenantId() tenantId: string,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: MarkAttendanceDto,
  ) {
    return this.employeesService.markAttendance(tenantId, user.userId, id, dto);
  }
}
