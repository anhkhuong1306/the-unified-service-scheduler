import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '@app/common';
import { CrmModule } from '@app/crm';
import { OrganizationModule } from '@app/organization';
import { WorkshopModule } from '@app/workshop';
import { ExpirePendingAppointmentsCron } from './cron/expire-pending-appointments.cron';

/**
 * Root Worker Application Module for `apps/scheduler-worker` (§3 & §7.5 of SYSTEM_DESIGN.md).
 *
 * Deployed as a single replica (`replicas: 1`) dedicated to background scheduled jobs
 * (`ExpirePendingAppointmentsCron`) so `apps/scheduler-api` can scale horizontally without duplicate cron runs.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
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
          max: 10,
          connectionTimeoutMillis: 3000,
          idleTimeoutMillis: 30000,
        },
      }),
    }),
    CommonModule,
    OrganizationModule,
    CrmModule,
    WorkshopModule,
  ],
  providers: [ExpirePendingAppointmentsCron],
})
export class SchedulerWorkerModule {}
