import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { HealthController } from './health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { RolePermissionsCacheModule } from './common/role-permissions-cache.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { BranchesModule } from './modules/branches/branches.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CashModule } from './modules/cash/cash.module';
import { SalesModule } from './modules/sales/sales.module';
import { CartsModule } from './modules/carts/carts.module';
import { PosModule } from './modules/pos/pos.module';
import { SellersModule } from './modules/sellers/sellers.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { WorkSessionsModule } from './modules/work-sessions/work-sessions.module';
import { DebtsModule } from './modules/debts/debts.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PartnersModule } from './modules/partners/partners.module';
import { LicenseKeysModule } from './modules/license-keys/license-keys.module';
import { ActivityLogModule } from './modules/activity-log/activity-log.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ExportsModule } from './modules/exports/exports.module';
import { BackupsModule } from './modules/backups/backups.module';
import { TenantModulesModule } from './modules/tenant-modules/tenant-modules.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { UploadsModule } from './common/uploads/uploads.module';
import { PaymentGatewayModule } from './modules/payment-gateway/payment-gateway.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { MailModule } from './common/mail/mail.module';
import { ModuleGuard } from './common/guards/module.guard';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { ActivityLogInterceptor } from './common/interceptors/activity-log.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RedisModule,
    QueueModule,
    RolePermissionsCacheModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    RolesModule,
    BranchesModule,
    CategoriesModule,
    ProductsModule,
    InventoryModule,
    SalesModule,
    DashboardModule,
    CashModule,
    CartsModule,
    PosModule,
    SellersModule,
    EmployeesModule,
    WorkSessionsModule,
    DebtsModule,
    SuppliersModule,
    ReturnsModule,
    ReportsModule,
    PartnersModule,
    LicenseKeysModule,
    ActivityLogModule,
    NotificationsModule,
    ExportsModule,
    BackupsModule,
    TenantModulesModule,
    SubscriptionsModule,
    UploadsModule,
    PaymentGatewayModule,
    FeedbackModule,
    MailModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
})
export class AppModule {}
