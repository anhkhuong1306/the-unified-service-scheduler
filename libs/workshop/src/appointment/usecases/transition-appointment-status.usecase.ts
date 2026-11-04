import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ForbiddenDomainException,
  LogSpan,
  ResourceNotFoundException,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import { ActorContext } from '../types/actor-context.interface';
import {
  AppointmentAction,
  AppointmentStateMachine,
} from '../state-machine/appointment.state-machine';
import { AppointmentEventsService } from '../services/appointment-events.service';
import { BookingLockService } from '../services/booking-lock.service';
import { AppointmentRepository } from '../repositories/appointment.repository';

@Injectable()
export class TransitionAppointmentStatusUseCase {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly stateMachine: AppointmentStateMachine,
    private readonly events: AppointmentEventsService,
    private readonly locks: BookingLockService,
    private readonly appointmentRepo: AppointmentRepository,
  ) {}

  @LogSpan()
  public async execute(
    appointmentId: string,
    action: AppointmentAction,
    actor: ActorContext,
    reason?: string,
  ): Promise<Appointment> {
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context in session');
    }
    const tenantId = actor.tenantId;

    return this.dataSource.transaction(async (manager: EntityManager) => {
      await this.locks.setLocalTimeouts(manager);

      const appointment = await this.appointmentRepo.findByIdWithLock(
        manager,
        appointmentId,
        tenantId,
      );

      if (!appointment) {
        throw new ResourceNotFoundException(`Appointment not found with ID ${appointmentId}`);
      }

      Appointment.assertStaffDealership(appointment, actor);

      const fromStatus = appointment.status;
      const targetStatus = this.stateMachine.validateTransition(fromStatus, action, actor);
      const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;

      const isCancellationAction =
        action === 'cancel' || action === 'reject' || action === 'no_show';

      // Concise mapping with Object.assign
      Object.assign(appointment, {
        status: targetStatus,
        ...(reason ? { cancelReason: reason } : {}),
        ...(isCancellationAction
          ? {
              cancelledAt: new Date(),
              cancelledBy: actorIdentifier,
            }
          : {}),
        updated_by: actorIdentifier,
      });

      const saved = await this.appointmentRepo.saveTransactional(manager, appointment);

      await this.events.recordTransitioned(manager, saved, fromStatus, actor, reason);

      return saved;
    });
  }
}
