import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '@app/common';
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
    CommonModule,
    WorkshopModule,
  ],
  providers: [ExpirePendingAppointmentsCron],
})
export class SchedulerWorkerModule {}
