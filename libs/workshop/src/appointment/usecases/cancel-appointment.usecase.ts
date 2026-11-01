import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ForbiddenDomainException,
  InvalidStateTransitionException,
  LogSpan,
  ResourceNotFoundException,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import { ActorContext } from '../types/actor-context.interface';
import { CustomerResolverService } from '../services/customer-resolver.service';
import { AppointmentEventsService } from '../services/appointment-events.service';
import { Clock } from '../services/clock';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { WorkshopSettingsRepository } from '../../settings/repositories/workshop-settings.repository';

/**
 * =========================================================================================
 * CancelAppointmentUseCase — Safe Appointment Cancellation with Concurrency & IDOR Guards
 * =========================================================================================
 */
@Injectable()
export class CancelAppointmentUseCase {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly customers: CustomerResolverService,
    private readonly events: AppointmentEventsService,
    private readonly clock: Clock,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly settingsRepo: WorkshopSettingsRepository,
  ) {}

  @LogSpan()
  public async execute(
    appointmentId: string,
    cancellationReason: string | undefined,
    actor: ActorContext,
  ): Promise<Appointment> {
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context (tenantId) in session');
    }
    const tenantId = actor.tenantId;

    const actingCustomerId =
      actor.actorType === 'customer'
        ? (await this.customers.resolve(actor)).id
        : undefined;

    return this.dataSource.transaction(async (manager: EntityManager) => {
      // 1. Pessimistic Write Lock (SELECT FOR UPDATE) via Repository
      const targetAppointment = await this.appointmentRepo.findByIdWithLock(
        manager,
        appointmentId,
        tenantId,
      );

      // 2. IDOR Guard: Uniformly return Not Found if non-existent or owned by another customer
      if (
        !targetAppointment ||
        (actingCustomerId && targetAppointment.customerId !== actingCustomerId)
      ) {
        throw new ResourceNotFoundException(`Appointment not found with ID ${appointmentId}`);
      }

      // 3. Cancellation Cutoff Enforcement for Customers via Settings Repository
      if (actor.actorType === 'customer') {
        const settings = await this.settingsRepo.getByDealershipIdOrFail(
          targetAppointment.dealershipId,
          tenantId,
          manager,
        );

        const cancellationCutoffMs = settings.cancellationCutoffMinutes * 60_000;
        const maximumAllowedCancellationTime = new Date(
          targetAppointment.startAt.getTime() - cancellationCutoffMs,
        );

        if (this.clock.now() > maximumAllowedCancellationTime) {
          throw new InvalidStateTransitionException(
            `Cancellation cutoff exceeded (appointments must be cancelled at least ${settings.cancellationCutoffMinutes} minutes before scheduled start)`,
          );
        }
      }

      // 4. Delegate status mutation to Domain Method on Entity
      const previousStatus = targetAppointment.cancel(
        actor,
        cancellationReason,
        this.clock.now(),
      );

      // 5. Persist via Repository
      const savedAppointment = await this.appointmentRepo.saveTransactional(
        manager,
        targetAppointment,
      );

      // 6. Audit Event & pg_notify Broadcast
      await this.events.recordCancelled(manager, savedAppointment, previousStatus, actor);

      return savedAppointment;
    });
  }
}
