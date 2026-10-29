import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule, CorrelationIdMiddleware } from '@app/common';
import { CrmModule } from '@app/crm';
import { OrganizationModule } from '@app/organization';
import { SsoMockModule } from '@app/sso-mock';
import { WorkshopModule } from '@app/workshop';
import { HealthController } from './health/health.controller';

/**
 * Root HTTP Application Module for `apps/scheduler-api` (§3 & §4.1 of SYSTEM_DESIGN.md).
 *
 * Mounts the shared infrastructure kernel (`@app/common`), the three DMS domain libraries
 * (`@app/workshop`, `@app/crm`, `@app/organization`), and the conditional `@app/sso-mock` provider.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    CommonModule,
    OrganizationModule,
    CrmModule,
    WorkshopModule,
    SsoMockModule.registerWhenEnabled(),
  ],
  controllers: [HealthController],
  providers: [],
})
export class SchedulerApiModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
