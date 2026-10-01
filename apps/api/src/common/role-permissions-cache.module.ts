import { Global, Module } from '@nestjs/common';
import { RolePermissionsCacheService } from './role-permissions-cache.service';

/** Global so both PermissionsGuard (root-level) and RolesService (feature module) share one cache */
@Global()
@Module({
  providers: [RolePermissionsCacheService],
  exports: [RolePermissionsCacheService],
})
export class RolePermissionsCacheModule {}
