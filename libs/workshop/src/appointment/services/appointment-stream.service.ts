import { Injectable, Logger, MessageEvent, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// @ts-ignore
import { Client } from 'pg';
import { filter, map, merge, Observable, Subject, timer } from 'rxjs';

export interface AppointmentEventPayload {
  eventType: string;
  appointmentId: string;
  referenceCode: string;
  tenantId?: string;
  dealershipId: string;
  customerId?: string;
  technicianId?: string;
  status: string;
  version: number;
}

@Injectable()
export class AppointmentStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AppointmentStreamService.name);
  private pgClient?: any;
  private readonly eventSubject = new Subject<AppointmentEventPayload>();
  private isDestroyed = false;

  public constructor(private readonly config: ConfigService) {}

  public async onModuleInit(): Promise<void> {
    await this.initPgListener();
  }

  public async onModuleDestroy(): Promise<void> {
    this.isDestroyed = true;
    await this.closePgClient();
  }

  private async closePgClient(): Promise<void> {
    if (this.pgClient) {
      try {
        await this.pgClient.end();
      } catch (err) {
        this.logger.warn(`Error closing PG listener client: ${(err as Error).message}`);
      } finally {
        this.pgClient = undefined;
      }
    }
  }

  private async initPgListener(): Promise<void> {
    if (this.isDestroyed) return;
    await this.closePgClient();

    try {
      const client = new Client({
        host: this.config.get<string>('DB_HOST', 'postgres'),
        port: Number(this.config.get<number>('DB_PORT', 5432)),
        user: this.config.get<string>('DB_USERNAME', 'scheduler'),
        password: this.config.get<string>('DB_PASSWORD', 'secret'),
        database: this.config.get<string>('DB_DATABASE', 'scheduler'),
      });

      await client.connect();
      this.pgClient = client;
      this.logger.log('Connected dedicated PG client for LISTEN appointment_events');

      client.on('notification', (msg: { channel?: string; payload?: string }) => {
        if (msg.channel === 'appointment_events' && msg.payload) {
          try {
            const parsed = JSON.parse(msg.payload) as AppointmentEventPayload;
            this.eventSubject.next(parsed);
          } catch (err) {
            this.logger.warn(`Failed to parse appointment event payload: ${(err as Error).message}`);
          }
        }
      });

      client.on('error', (err: Error) => {
        this.logger.warn(`PG listener error: ${err.message}. Retrying in 5s...`);
        if (!this.isDestroyed) {
          setTimeout(() => void this.initPgListener(), 5000);
        }
      });

      await client.query('LISTEN appointment_events');
    } catch (err) {
      this.logger.warn(
        `Could not initialize PG LISTEN client: ${(err as Error).message}. Will retry in 5s.`,
      );
      if (!this.isDestroyed) {
        setTimeout(() => void this.initPgListener(), 5000);
      }
    }
  }

  /**
   * Broadcast an in-memory event directly (useful for testing or fallback).
   */
  public broadcastLocal(payload: AppointmentEventPayload): void {
    this.eventSubject.next(payload);
  }

  /**
   * SSE Stream for Customer screen. Filters events matching customer's own ID and tenant.
   * Includes keep-alive ping every 15s. Fail-closed: events without customerId are rejected.
   */
  public streamForCustomer(customerId: string, tenantId?: string): Observable<MessageEvent> {
    const keepAlive$ = timer(0, 15000).pipe(
      map(() => ({
        data: { type: 'ping', timestamp: new Date().toISOString() },
      } as MessageEvent)),
    );

    const events$ = this.eventSubject.asObservable().pipe(
      filter((e) => {
        if (!e.customerId || String(e.customerId) !== String(customerId)) {
          return false;
        }
        if (tenantId && e.tenantId && String(e.tenantId) !== String(tenantId)) {
          return false;
        }
        return true;
      }),
      map(
        (e) =>
          ({
            type: e.eventType,
            data: e,
            id: `${e.appointmentId}-${e.version}`,
          } as MessageEvent),
      ),
    );

    return merge(keepAlive$, events$);
  }

  /**
   * SSE Stream for Dealership Staff / Technician Board.
   * Can filter by dealershipId and optional technicianId.
   */
  public streamForStaff(dealershipId?: string, technicianId?: string, tenantId?: string): Observable<MessageEvent> {
    const keepAlive$ = timer(0, 15000).pipe(
      map(() => ({
        data: { type: 'ping', timestamp: new Date().toISOString() },
      } as MessageEvent)),
    );

    const events$ = this.eventSubject.asObservable().pipe(
      filter((e) => {
        if (tenantId && e.tenantId && String(e.tenantId) !== String(tenantId)) {
          return false;
        }
        if (dealershipId && String(e.dealershipId) !== String(dealershipId)) {
          return false;
        }
        if (technicianId && e.technicianId && String(e.technicianId) !== String(technicianId)) {
          return false;
        }
        return true;
      }),
      map(
        (e) =>
          ({
            type: e.eventType,
            data: e,
            id: `${e.appointmentId}-${e.version}`,
          } as MessageEvent),
      ),
    );

    return merge(keepAlive$, events$);
  }
}
