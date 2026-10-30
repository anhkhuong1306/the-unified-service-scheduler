import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppLogger } from '@app/common';
import { SchedulerWorkerModule } from './scheduler-worker.module';

async function bootstrap(): Promise<void> {
  const appLogger = new AppLogger();
  const logger = new Logger('SchedulerWorkerBootstrap');

  try {
    await NestFactory.createApplicationContext(SchedulerWorkerModule, {
      logger: appLogger,
    });
    logger.log(
      'scheduler-worker context initialized and cron schedules registered',
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown worker bootstrap failure';
    logger.error(`Failed to bootstrap scheduler-worker: ${message}`);
    process.exit(1);
  }
}

void bootstrap();
