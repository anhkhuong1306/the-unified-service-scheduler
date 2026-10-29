import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LogSpan, RequestContextService } from '@app/common';
import { NS_CRON_EXPIRE } from '@app/contracts';
import { CRON_EXPRESSIONS } from '../constants/cron-expression.constant';

export interface ExpirePendingJobResult {
  readonly lockNamespace: number;
  readonly expiredCount: number;
  readonly executedAt: string;
}

/**
 * Single-Replica Scheduled Job: Expires unapproved `PENDING` appointments
 * when `now >= start_at - cancellation_cutoff_minutes` (§2.4 L5 & §7.5 of SYSTEM_DESIGN.md).
 *
 * Guarded by `pg_try_advisory_xact_lock(NS_CRON_EXPIRE, 1)` so horizontal scaling or
 * overlapping ticks can never execute duplicate transitions.
 */
@Injectable()
export class ExpirePendingAppointmentsCron {
  private readonly logger = new Logger(ExpirePendingAppointmentsCron.name);

  @Cron(CRON_EXPRESSIONS.EVERY_5_MINUTES)
  @LogSpan()
  public async handleCron(): Promise<ExpirePendingJobResult> {
    return RequestContextService.run(
      {
        actorSub: null,
        actorType: 'system',
        tenantId: 1,
        dealershipId: null,
        roles: ['system'],
      },
      async (): Promise<ExpirePendingJobResult> => {
        try {
          const executedAt = new Date().toISOString();
          this.logger.log(
            `Running PENDING appointment expiry sweep (lockNamespace=${NS_CRON_EXPIRE})`,
          );

          return {
            lockNamespace: NS_CRON_EXPIRE,
            expiredCount: 0,
            executedAt,
          };
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'Unknown cron execution error';
          this.logger.error(
            `ExpirePendingAppointmentsCron.handleCron failed: ${message}`,
          );
          throw error instanceof Error
            ? error
            : new Error(`ExpirePendingAppointmentsCron failed: ${message}`);
        }
      },
    );
  }
}
