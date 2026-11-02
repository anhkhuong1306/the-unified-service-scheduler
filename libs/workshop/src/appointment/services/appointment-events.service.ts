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

  private extractUuidSub(actorSub?: string | null): string | null {
    if (!actorSub) return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorSub);
    return isUuid ? actorSub : null;
  }

  public async recordCreated(
    m: EntityManager,
    a: Appointment,
    actor: ActorContext,
  ): Promise<void> {
    await this.eventRepo.saveEvent(m, {
      appointmentId: a.id,
      fromStatus: null,
      toStatus: a.status,
      actorSubject: this.extractUuidSub(actor.actorSub),
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

  public async recordUpdated(
    m: EntityManager,
    a: Appointment,
    actor: ActorContext,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.eventRepo.saveEvent(m, {
      appointmentId: a.id,
      fromStatus: a.status,
      toStatus: a.status,
      actorSubject: this.extractUuidSub(actor.actorSub),
      actorType: actor.actorType,
      changes,
    });
    await this.notify(m, 'APPOINTMENT_UPDATED', a);
  }

  public async recordTransitioned(
    m: EntityManager,
    a: Appointment,
    fromStatus: AppointmentStatus,
    actor: ActorContext,
    reason?: string,
  ): Promise<void> {
    await this.eventRepo.saveEvent(m, {
      appointmentId: a.id,
      fromStatus,
      toStatus: a.status,
      actorSubject: this.extractUuidSub(actor.actorSub),
      actorType: actor.actorType,
      changes: reason ? { reason } : null,
    });
    await this.notify(m, 'APPOINTMENT_STATUS_CHANGED', a);
  }

  public async recordReassigned(
    m: EntityManager,
    a: Appointment,
    actor: ActorContext,
    changes: Record<string, unknown>,
  ): Promise<void> {
    await this.eventRepo.saveEvent(m, {
      appointmentId: a.id,
      fromStatus: a.status,
      toStatus: a.status,
      actorSubject: this.extractUuidSub(actor.actorSub),
      actorType: actor.actorType,
      changes,
    });
    await this.notify(m, 'APPOINTMENT_REASSIGNED', a);
  }

  public async recordSwapped(
    m: EntityManager,
    a: Appointment,
    actor: ActorContext,
    otherAppointmentId: string,
  ): Promise<void> {
    await this.eventRepo.saveEvent(m, {
      appointmentId: a.id,
      fromStatus: a.status,
      toStatus: a.status,
      actorSubject: this.extractUuidSub(actor.actorSub),
      actorType: actor.actorType,
      changes: { swappedWith: otherAppointmentId },
    });
    await this.notify(m, 'APPOINTMENT_SWAPPED', a);
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
      actorSubject: this.extractUuidSub(actor.actorSub),
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
      tenantId: a.tenantId,
      dealershipId: a.dealershipId,
      customerId: a.customerId,
      technicianId: a.technicianId,
      status: a.status,
      version: a.version,
    });
    await this.eventRepo.notifyChannel(m, 'appointment_events', payload);
  }
}
