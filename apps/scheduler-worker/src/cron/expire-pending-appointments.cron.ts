import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
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

  public constructor(private readonly dataSource: DataSource) {}

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
        const executedAt = new Date().toISOString();
        try {
          return await this.dataSource.transaction(async (manager: EntityManager) => {
            const lockRows = await manager.query<{ locked: boolean }[]>(
              `SELECT pg_try_advisory_xact_lock($1, 1) AS locked`,
              [NS_CRON_EXPIRE],
            );

            if (!lockRows[0]?.locked) {
              this.logger.log(
                `Another worker pod holds NS_CRON_EXPIRE lock; skipping sweep.`,
              );
              return {
                lockNamespace: NS_CRON_EXPIRE,
                expiredCount: 0,
                executedAt,
              };
            }

            this.logger.log(
              `Acquired NS_CRON_EXPIRE lock. Running PENDING appointment expiry sweep...`,
            );

            const expiredRows = await manager.query<{
              id: string;
              dealership_id: string;
              reference_code: string;
              version: number;
            }[]>(
              `SELECT a.id, a.dealership_id, a.reference_code, a.version
               FROM appointments a
               JOIN workshop_settings s ON s.dealership_id = a.dealership_id
               WHERE a.status = 'PENDING'
                 AND NOW() >= a.start_at - (s.cancellation_cutoff_minutes || ' minutes')::interval
               FOR UPDATE OF a SKIP LOCKED
               LIMIT 50`,
            );

            if (expiredRows.length === 0) {
              return {
                lockNamespace: NS_CRON_EXPIRE,
                expiredCount: 0,
                executedAt,
              };
            }

            for (const row of expiredRows) {
              await manager.query(
                `UPDATE appointments
                 SET status = 'EXPIRED',
                     cancel_reason = 'Expired automatically past approval cutoff',
                     cancelled_at = NOW(),
                     cancelled_by = 'system_cron',
                     updated_by = 'system_cron',
                     version = version + 1
                 WHERE id = $1`,
                [row.id],
              );

              await manager.query(
                `INSERT INTO appointment_events (
                   appointment_id, from_status, to_status, actor_subject, actor_type, changes, created_at
                 ) VALUES ($1, 'PENDING', 'EXPIRED', NULL, 'system', $2, NOW())`,
                [row.id, JSON.stringify({ reason: 'Auto-expired past cutoff' })],
              );

              const notifyPayload = JSON.stringify({
                eventType: 'APPOINTMENT_STATUS_CHANGED',
                appointmentId: row.id,
                referenceCode: row.reference_code,
                dealershipId: row.dealership_id,
                status: 'EXPIRED',
                version: row.version + 1,
              });

              await manager.query(`SELECT pg_notify('appointment_events', $1)`, [notifyPayload]);
            }

            this.logger.log(`Expired ${expiredRows.length} overdue PENDING appointment(s).`);

            return {
              lockNamespace: NS_CRON_EXPIRE,
              expiredCount: expiredRows.length,
              executedAt,
            };
          });
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
