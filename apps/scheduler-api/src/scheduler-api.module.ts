import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard, CommonModule, CorrelationIdMiddleware } from '@app/common';
import { CrmModule } from '@app/crm';
import { OrganizationModule } from '@app/organization';
import { SsoMockModule } from '@app/sso-mock';
import { WorkshopModule } from '@app/workshop';
import { HealthController } from './health/health.controller';
import { AppointmentsController } from './appointments/appointments.controller';
import { DealershipsController } from './dealerships/dealerships.controller';
import { ServiceTypesController } from './catalog/service-types.controller';
import { CustomerVehiclesController } from './crm/customer-vehicles.controller';

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
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'postgres'),
        port: Number(config.get<number>('DB_PORT', 5432)),
        username: config.get<string>('DB_USERNAME', 'scheduler'),
        password: config.get<string>('DB_PASSWORD', 'secret'),
        database: config.get<string>('DB_DATABASE', 'scheduler'),
        autoLoadEntities: true,
        synchronize: false,
        extra: {
          max: 25,
          connectionTimeoutMillis: 3000,
          idleTimeoutMillis: 30000,
        },
      }),
    }),
    CommonModule,
    OrganizationModule,
    CrmModule,
    WorkshopModule,
    SsoMockModule.registerWhenEnabled(),
  ],
  controllers: [
    HealthController,
    AppointmentsController,
    DealershipsController,
    ServiceTypesController,
    CustomerVehiclesController,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class SchedulerApiModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
