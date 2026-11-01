import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Appointment } from '../entities/appointment.entity';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { ActorContext } from '../types/actor-context.interface';
import { AppointmentEventRepository } from '../repositories/appointment-event.repository';

@Injectable()
export class AppointmentEventsService {
  public constructor(
    private readonly eventRepo: AppointmentEventRepository,
  ) {}

  public async recordCreated(
    m: EntityManager,
    a: Appointment,
    actor: ActorContext,
  ): Promise<void> {
    await this.eventRepo.saveEvent(m, {
      appointmentId: a.id,
      fromStatus: null,
      toStatus: a.status,
      actorSubject: actor.actorSub,
      actorType: actor.actorType,
      changes: {
        referenceCode: a.referenceCode,
        serviceBayId: a.serviceBayId,
        technicianId: a.technicianId,
        startAt: a.startAt.toISOString(),
        endAt: a.endAt.toISOString(),
      },
    });
    await this.notify(m, 'APPOINTMENT_CREATED', a);
  }

  public async recordCancelled(
    m: EntityManager,
    a: Appointment,
    fromStatus: AppointmentStatus,
    actor: ActorContext,
  ): Promise<void> {
    await this.eventRepo.saveEvent(m, {
      appointmentId: a.id,
      fromStatus,
      toStatus: a.status,
      actorSubject: actor.actorSub,
      actorType: actor.actorType,
      changes: {
        cancelReason: a.cancelReason,
      },
    });
    await this.notify(m, 'APPOINTMENT_CANCELLED', a);
  }

  private async notify(
    m: EntityManager,
    eventType: string,
    a: Appointment,
  ): Promise<void> {
    const payload = JSON.stringify({
      eventType,
      appointmentId: a.id,
      referenceCode: a.referenceCode,
      dealershipId: a.dealershipId,
      status: a.status,
      version: a.version,
    });
    await this.eventRepo.notifyChannel(m, 'appointment_events', payload);
  }
}
