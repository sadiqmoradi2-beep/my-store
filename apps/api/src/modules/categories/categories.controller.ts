import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@my-store/shared';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CategoriesService } from './categories.service';

@ApiTags('categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get('tree')
  @RequirePermissions(PERMISSIONS.CATEGORIES_READ)
  tree(@TenantId() tenantId: string) {
    return this.categoriesService.tree(tenantId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CATEGORIES_CREATE)
  create(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_UPDATE)
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.CATEGORIES_DELETE)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.categoriesService.remove(tenantId, id);
  }
}
