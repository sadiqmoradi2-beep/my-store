import { Global, Module } from '@nestjs/common';
import { ModuleAccessService } from './module-access.service';
import { TenantModulesController } from './tenant-modules.controller';
import { TenantModulesService } from './tenant-modules.service';

/** Global — the global ModuleGuard needs ModuleAccessService */
@Global()
@Module({
  controllers: [TenantModulesController],
  providers: [ModuleAccessService, TenantModulesService],
  exports: [ModuleAccessService],
})
export class TenantModulesModule {}
