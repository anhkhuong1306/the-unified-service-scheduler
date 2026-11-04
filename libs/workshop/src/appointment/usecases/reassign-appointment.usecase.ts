import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DomainException,
  ErrorCode,
  ForbiddenDomainException,
  InvalidStateTransitionException,
  LogSpan,
  ResourceNotFoundException,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import { ReassignAppointmentDto } from '../dto/reassign-appointment.dto';
import { ActorContext } from '../types/actor-context.interface';
import { AppointmentEventsService } from '../services/appointment-events.service';
import { BookingLockService } from '../services/booking-lock.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { AppointmentAvailabilityRepository } from '../repositories/appointment-availability.repository';
import { ServiceTypeRepository } from '../../service-catalog/repositories/service-type.repository';

@Injectable()
export class ReassignAppointmentUseCase {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly events: AppointmentEventsService,
    private readonly locks: BookingLockService,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly availability: AppointmentAvailabilityRepository,
    private readonly serviceTypeRepo: ServiceTypeRepository,
  ) {}

  @LogSpan()
  public async execute(
    appointmentId: string,
    dto: ReassignAppointmentDto,
    actor: ActorContext,
  ): Promise<Appointment> {
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context in session');
    }
    const tenantId = actor.tenantId;

    if (actor.actorType !== 'staff' && actor.actorType !== 'system') {
      throw new ForbiddenDomainException('Only staff or system can reassign appointments');
    }

    if (!dto.technicianId && !dto.serviceBayId) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'At least one of technicianId or serviceBayId must be provided for reassignment',
        null,
        400,
      );
    }

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
      Appointment.assertModifiable(appointment, 'reassign');

      await this.locks.lockDealership(manager, appointment.dealershipId);

      const changes: Record<string, unknown> = {};
      const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;

      // 1. Reassign Technician Check (Concurrent Skill & Slot availability check)
      if (dto.technicianId && dto.technicianId !== appointment.technicianId) {
        const typeIds = appointment.serviceTypeIds && appointment.serviceTypeIds.length > 0
          ? appointment.serviceTypeIds
          : [appointment.serviceTypeId];

        const serviceTypes = await this.serviceTypeRepo.getByIdsOrFail(
          typeIds.map(String),
          tenantId,
          manager,
        );

        const requiredSkillIds = Array.from(
          new Set(serviceTypes.map((st) => st.skillId).filter(Boolean) as string[]),
        );

        const [hasSkills, isFree] = await Promise.all([
          this.availability.technicianHasRequiredSkills(manager, dto.technicianId, requiredSkillIds),
          this.availability.isTechnicianFree(
            manager,
            dto.technicianId,
            appointment.startAt,
            appointment.occupiedUntil,
            appointment.id,
          ),
        ]);

        if (!hasSkills) {
          throw new DomainException(
            ErrorCode.VALIDATION_FAILED,
            `Technician ${dto.technicianId} does not possess the required skills for this appointment`,
            null,
            400,
          );
        }

        if (!isFree) {
          throw new DomainException(
            ErrorCode.TECHNICIAN_UNAVAILABLE,
            `Technician ${dto.technicianId} is not available in the required time slot`,
            null,
            409,
          );
        }

        changes.previousTechnicianId = appointment.technicianId;
        appointment.technicianId = dto.technicianId;
        changes.newTechnicianId = dto.technicianId;
      }

      // 2. Reassign Service Bay Check
      if (dto.serviceBayId && dto.serviceBayId !== appointment.serviceBayId) {
        const isFree = await this.availability.isBayFree(
          manager,
          dto.serviceBayId,
          appointment.startAt,
          appointment.occupiedUntil,
          appointment.id,
        );

        if (!isFree) {
          throw new DomainException(
            ErrorCode.BAY_UNAVAILABLE,
            `Service bay ${dto.serviceBayId} is not available in the required time slot`,
            null,
            409,
          );
        }

        changes.previousServiceBayId = appointment.serviceBayId;
        appointment.serviceBayId = dto.serviceBayId;
        changes.newServiceBayId = dto.serviceBayId;
      }

      if (dto.reason) {
        changes.reason = dto.reason;
      }

      appointment.updated_by = actorIdentifier;
      const saved = await this.appointmentRepo.saveTransactional(manager, appointment);

      await this.events.recordReassigned(manager, saved, actor, changes);

      return saved;
    });
  }
}
