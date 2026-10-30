import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ForbiddenDomainException,
  InvalidStateTransitionException,
  LogSpan,
  ResourceNotFoundException,
} from '@app/common';
import { WorkshopSettings } from '../settings/workshop-settings.entity';
import { Appointment } from './appointment.entity';
import { ActorContext } from './actor-context';
import { CustomerResolverService } from './services/customer-resolver.service';
import { AppointmentEventsService } from './services/appointment-events.service';
import { Clock } from './services/clock';

/**
 * =========================================================================================
 * CancelAppointmentUseCase — Safe Appointment Cancellation with Concurrency & IDOR Guards
 * =========================================================================================
 *
 * DESIGN INTENT & ARCHITECTURAL PURPOSE:
 * 1. Lost Update Prevention (Section A6):
 *    - Acquires an exclusive row lock (`lock: { mode: 'pessimistic_write' }`, emitting `SELECT FOR UPDATE`)
 *      when reading the target appointment inside the transaction.
 *    - Eliminates race conditions where two concurrent requests (e.g. customer cancels while staff approves
 *      or marks checked-in) read stale state and overwrite each other.
 * 2. IDOR Information Leak Prevention (Section A7):
 *    - If a customer attempts to cancel an appointment belonging to another customer, the use case throws
 *      `ResourceNotFoundException` instead of `ForbiddenException`.
 *    - This uniform response prevents malicious actors from enumerating valid appointment UUIDs.
 * 3. Strict Cancellation Cutoff Enforcement (Section A8):
 *    - Customers may only self-cancel if the current time does not exceed `startAt - cancellationCutoffMinutes`.
 *    - Never silently bypasses the cutoff if settings are missing; throws an explicit exception instead.
 *    - Dealership staff members are exempted from cutoff restrictions (Staff Override capability).
 * 4. Domain-Driven Encapsulation on Entity (Section B6, E8):
 *    - Delegates state mutation, transition validation, and audit timestamps to `appointment.cancel(...)`.
 * 5. Audit Trail & Real-time Broadcast (Section E9):
 *    - Records an immutable `AppointmentEvent` and emits a transactional `pg_notify` event carrying the
 *      monotonic entity `version` to ensure Server-Sent Events (SSE) clients process updates in order.
 */
@Injectable()
export class CancelAppointmentUseCase {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly customers: CustomerResolverService,
    private readonly events: AppointmentEventsService,
    private readonly clock: Clock,
  ) {}

  /**
   * Cancels an existing service appointment.
   *
   * @param appointmentId Target appointment UUID string.
   * @param cancellationReason Optional explanation string for cancellation.
   * @param actor Authenticated caller context (JWT subject, actor type, tenantId).
   * @returns Persisted Appointment record updated to CANCELLED status.
   * @throws ForbiddenDomainException If tenant context is missing.
   * @throws ResourceNotFoundException If appointment does not exist or belongs to another customer.
   * @throws InvalidStateTransitionException If appointment is in a non-cancellable state or cutoff has passed.
   */
  @LogSpan()
  public async execute(
    appointmentId: string,
    cancellationReason: string | undefined,
    actor: ActorContext,
  ): Promise<Appointment> {
    // A9: Multi-tenancy guard - prohibit implicit fallback to default tenant
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context (tenantId) in session');
    }
    const tenantId = actor.tenantId;

    // Resolve customer identity only for customer actors; staff actors do not require CRM resolution
    const actingCustomerId =
      actor.actorType === 'customer'
        ? (await this.customers.resolve(actor)).id
        : undefined;

    return this.dataSource.transaction(async (transactionManager: EntityManager) => {
      // 1. Pessimistic Write Lock (SELECT FOR UPDATE) to prevent lost updates (A6)
      const targetAppointment = await transactionManager.findOne(Appointment, {
        where: { id: appointmentId, tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      // 2. IDOR Guard (A7): Uniformly return Not Found if non-existent or owned by another customer
      if (
        !targetAppointment ||
        (actingCustomerId && targetAppointment.customerId !== actingCustomerId)
      ) {
        throw new ResourceNotFoundException(`Appointment not found with ID ${appointmentId}`);
      }

      // 3. Cancellation Cutoff Enforcement for Customers (A8)
      if (actor.actorType === 'customer') {
        const settings = await transactionManager.findOne(WorkshopSettings, {
          where: { dealershipId: targetAppointment.dealershipId, tenantId },
        });
        if (!settings) {
          throw new ResourceNotFoundException(
            `Workshop settings not found for dealership ${targetAppointment.dealershipId}`,
          );
        }

        // cancellationCutoffMinutes: Minimum advance notice window in integer minutes (e.g., 120 minutes)
        // cancellationCutoffMs: Cutoff duration converted to milliseconds
        const cancellationCutoffMs = settings.cancellationCutoffMinutes * 60_000;

        // maximumAllowedCancellationTime: Absolute cutoff threshold timestamp
        // @example '2026-11-01T06:00:00.000Z' for an appointment starting at 08:00:00Z with 120m cutoff
        const maximumAllowedCancellationTime = new Date(
          targetAppointment.startAt.getTime() - cancellationCutoffMs,
        );

        if (this.clock.now() > maximumAllowedCancellationTime) {
          throw new InvalidStateTransitionException(
            `Cancellation cutoff exceeded (appointments must be cancelled at least ${settings.cancellationCutoffMinutes} minutes before scheduled start)`,
          );
        }
      }

      // 4. Delegate status mutation to Domain Method on Entity (B6, E8)
      const previousStatus = targetAppointment.cancel(
        actor,
        cancellationReason,
        this.clock.now(),
      );

      // Persist changes
      const savedAppointment = await transactionManager.save(Appointment, targetAppointment);

      // 5. Record Audit Event & Broadcast Real-Time Notification carrying version (E9)
      await this.events.recordCancelled(
        transactionManager,
        savedAppointment,
        previousStatus,
        actor,
      );

      return savedAppointment;
    });
  }
}
