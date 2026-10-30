import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Appointment } from '../appointment.entity';
import { AppointmentEvent } from '../appointment-event.entity';
import { AppointmentStatus } from '../appointment-status.enum';
import { ActorContext } from '../actor-context';

@Injectable()
export class AppointmentEventsService {
  public async recordCreated(
    m: EntityManager,
    a: Appointment,
    actor: ActorContext,
  ): Promise<void> {
    const event = m.create(AppointmentEvent, {
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
    await m.save(AppointmentEvent, event);
    await this.notify(m, 'APPOINTMENT_CREATED', a);
  }

  public async recordCancelled(
    m: EntityManager,
    a: Appointment,
    fromStatus: AppointmentStatus,
    actor: ActorContext,
  ): Promise<void> {
    const event = m.create(AppointmentEvent, {
      appointmentId: a.id,
      fromStatus,
      toStatus: a.status,
      actorSubject: actor.actorSub,
      actorType: actor.actorType,
      changes: {
        cancelReason: a.cancelReason,
      },
    });
    await m.save(AppointmentEvent, event);
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
    await m.query("SELECT pg_notify('appointment_events', $1)", [payload]);
  }
}
