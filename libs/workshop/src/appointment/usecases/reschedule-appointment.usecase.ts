import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ForbiddenDomainException,
  InvalidStateTransitionException,
  LogSpan,
  ResourceNotFoundException,
  ValidationFailedException,
  VehicleAlreadyBookedException,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import { RescheduleAppointmentDto } from '../dto/reschedule-appointment.dto';
import { ActorContext } from '../types/actor-context.interface';
import { ACTIVE_STATUSES } from '../types/appointment.constants';
import { AppointmentEventsService } from '../services/appointment-events.service';
import { BookingLockService } from '../services/booking-lock.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { AppointmentAvailabilityRepository } from '../repositories/appointment-availability.repository';
import { WorkshopSettingsRepository } from '../../settings/repositories/workshop-settings.repository';
import { ServiceTypeRepository } from '../../service-catalog/repositories/service-type.repository';
import { AppointmentSlotValidator } from '../services/appointment-slot-validator.service';
import { ResourceAllocator } from '../services/resource-allocator.service';

@Injectable()
export class RescheduleAppointmentUseCase {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly events: AppointmentEventsService,
    private readonly locks: BookingLockService,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly availability: AppointmentAvailabilityRepository,
    private readonly settingsRepo: WorkshopSettingsRepository,
    private readonly serviceTypeRepo: ServiceTypeRepository,
    private readonly slotValidator: AppointmentSlotValidator,
    private readonly allocator: ResourceAllocator,
  ) {}

  @LogSpan()
  public async execute(
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    actor: ActorContext,
  ): Promise<Appointment> {
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context in session');
    }
    const tenantId = actor.tenantId;

    if (actor.actorType !== 'staff' && actor.actorType !== 'system') {
      throw new ForbiddenDomainException('Only staff or system can reschedule appointments');
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

      const isActive = (ACTIVE_STATUSES as readonly string[]).includes(appointment.status);
      if (!isActive) {
        throw new InvalidStateTransitionException(
          `Cannot reschedule appointment currently in ${appointment.status} status`,
        );
      }

      await this.locks.lockDealership(manager, appointment.dealershipId);

      const settings = await this.settingsRepo.getByDealershipIdOrFail(
        appointment.dealershipId,
        tenantId,
        manager,
      );

      const typeIds = appointment.serviceTypeIds && appointment.serviceTypeIds.length > 0
        ? appointment.serviceTypeIds
        : [appointment.serviceTypeId];

      const serviceTypes = await this.serviceTypeRepo.getByIdsOrFail(
        typeIds.map(String),
        tenantId,
        manager,
      );

      const targetStart = dto.startAt;
      if (!targetStart) {
        throw new ValidationFailedException('New scheduled start time is required');
      }

      // Validate slot grid, early arrival bypasses customer lead-time
      const newSlot = this.slotValidator.resolveAndValidateSlot(
        settings,
        serviceTypes,
        targetStart,
      );

      // Check vehicle overlap
      const hasOverlap = await this.availability.hasVehicleOverlap(
        manager,
        appointment.vehicleId,
        newSlot.startAt,
        newSlot.occupiedUntil,
        appointment.id,
      );

      if (hasOverlap) {
        throw new VehicleAlreadyBookedException(
          'Vehicle already has an overlapping active appointment in the requested period',
        );
      }

      const requiredSkillIds = Array.from(
        new Set(serviceTypes.map((st) => st.skillId).filter(Boolean) as string[]),
      );

      const targetTechId = dto.technicianId ?? appointment.technicianId;
      const { bayId, technicianId } = await this.allocator.allocate(manager, {
        dealershipId: appointment.dealershipId,
        skillId: requiredSkillIds[0] ?? null,
        skillIds: requiredSkillIds,
        requestedTechnicianId: targetTechId,
        slot: newSlot,
        excludeAppointmentId: appointment.id,
      });

      const changes = {
        previousStartAt: appointment.startAt.toISOString(),
        newStartAt: newSlot.startAt.toISOString(),
        previousBayId: appointment.serviceBayId,
        newBayId: bayId,
        previousTechnicianId: appointment.technicianId,
        newTechnicianId: technicianId,
        notes: dto.notes,
      };

      const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;

      // Concise Object.assign mapping
      Object.assign(appointment, {
        startAt: newSlot.startAt,
        endAt: newSlot.endAt,
        occupiedUntil: newSlot.occupiedUntil,
        serviceBayId: bayId,
        technicianId,
        ...(dto.notes ? { notes: dto.notes } : {}),
        updated_by: actorIdentifier,
      });

      const saved = await this.appointmentRepo.saveTransactional(manager, appointment);

      await this.events.recordUpdated(manager, saved, actor, changes);

      return saved;
    });
  }
}
