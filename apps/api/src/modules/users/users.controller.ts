import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { CurrentUser, RequestUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_READ)
  list(@TenantId() tenantId: string, @Query() query: PaginationQueryDto) {
    return this.usersService.list(tenantId, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  create(@TenantId() tenantId: string, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USERS_DELETE)
  remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.remove(tenantId, id, user.userId);
  }
}
