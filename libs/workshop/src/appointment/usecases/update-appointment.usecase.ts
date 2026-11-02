import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  DomainException,
  ErrorCode,
  ForbiddenDomainException,
  InvalidStateTransitionException,
  LogSpan,
  ResourceNotFoundException,
  VehicleAlreadyBookedException,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import { UpdateAppointmentDto } from '../dto/update-appointment.dto';
import { ActorContext } from '../types/actor-context.interface';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { CustomerResolverService } from '../services/customer-resolver.service';
import { AppointmentEventsService } from '../services/appointment-events.service';
import { BookingLockService } from '../services/booking-lock.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { AppointmentDetailRepository } from '../repositories/appointment-detail.repository';
import { AppointmentAvailabilityRepository } from '../repositories/appointment-availability.repository';
import { WorkshopSettingsRepository } from '../../settings/repositories/workshop-settings.repository';
import { ServiceTypeRepository } from '../../service-catalog/repositories/service-type.repository';
import { AppointmentSlotValidator } from '../services/appointment-slot-validator.service';
import { ResourceAllocator } from '../services/resource-allocator.service';
import { AppointmentFactory } from '../factories/appointment.factory';
import { Clock } from '../services/clock';

@Injectable()
export class UpdateAppointmentUseCase {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly customers: CustomerResolverService,
    private readonly events: AppointmentEventsService,
    private readonly locks: BookingLockService,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly detailRepo: AppointmentDetailRepository,
    private readonly availability: AppointmentAvailabilityRepository,
    private readonly settingsRepo: WorkshopSettingsRepository,
    private readonly serviceTypeRepo: ServiceTypeRepository,
    private readonly slotValidator: AppointmentSlotValidator,
    private readonly allocator: ResourceAllocator,
    private readonly clock: Clock,
  ) {}

  @LogSpan()
  public async execute(
    appointmentId: string,
    dto: UpdateAppointmentDto,
    actor: ActorContext,
  ): Promise<Appointment> {
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context in session');
    }
    const tenantId = actor.tenantId;

    const actingCustomerId =
      actor.actorType === 'customer'
        ? (await this.customers.resolve(actor)).id
        : undefined;

    return this.dataSource.transaction(async (manager: EntityManager) => {
      await this.locks.setLocalTimeouts(manager);

      const appointment = await this.appointmentRepo.findByIdWithLock(
        manager,
        appointmentId,
        tenantId,
      );

      if (!appointment || (actingCustomerId && appointment.customerId !== actingCustomerId)) {
        throw new ResourceNotFoundException(`Appointment not found with ID ${appointmentId}`);
      }

      // 1. Optimistic Locking Check
      if (dto.version !== undefined && appointment.version !== dto.version) {
        throw new DomainException(
          ErrorCode.VERSION_CONFLICT,
          `Appointment has been modified by another transaction. Expected version ${dto.version}, but found ${appointment.version}.`,
          null,
          409,
        );
      }

      // 2. Modifiable Status Check
      if (
        appointment.status !== AppointmentStatus.PENDING &&
        appointment.status !== AppointmentStatus.CONFIRMED
      ) {
        throw new InvalidStateTransitionException(
          `Cannot update appointment in status ${appointment.status}. Only PENDING and CONFIRMED appointments can be modified.`,
        );
      }

      const settings = await this.settingsRepo.getByDealershipIdOrFail(
        appointment.dealershipId,
        tenantId,
        manager,
      );

      // 3. Cutoff Check for Customer
      if (actor.actorType === 'customer') {
        const cutoffMs = settings.cancellationCutoffMinutes * 60_000;
        const cutoffTime = new Date(appointment.startAt.getTime() - cutoffMs);
        if (this.clock.now() > cutoffTime) {
          throw new InvalidStateTransitionException(
            `Modification cutoff exceeded (appointments can only be modified at least ${settings.cancellationCutoffMinutes} minutes before scheduled start)`,
          );
        }
      }

      await this.locks.lockDealership(manager, appointment.dealershipId);

      const changes: Record<string, unknown> = {};
      const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;

      // 4. Vehicle Update Check
      if (dto.vehicleId && dto.vehicleId !== appointment.vehicleId) {
        const vehicle = await this.customers.requireVehicle(dto.vehicleId, appointment.customerId, tenantId);
        Object.assign(appointment, {
          vehicleId: vehicle.id,
          vehiclePlate: vehicle.licensePlate,
          vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(),
        });
        changes.vehicleId = vehicle.id;
      }

      // 5. Service Types & Slot Timing Update
      const targetServiceTypeIds = dto.serviceTypeIds ?? appointment.serviceTypeIds;
      const targetStartAtStr = dto.startAt ?? appointment.startAt.toISOString();
      const isSlotOrServiceChanged = Boolean(dto.startAt || dto.serviceTypeIds);

      if (isSlotOrServiceChanged && targetServiceTypeIds && targetServiceTypeIds.length > 0) {
        const serviceTypes = await this.serviceTypeRepo.getByIdsOrFail(
          targetServiceTypeIds.map(String),
          tenantId,
          manager,
        );

        const newSlot = this.slotValidator.resolveAndValidateSlot(
          settings,
          serviceTypes,
          targetStartAtStr,
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

        // Concise Object.assign mapping
        Object.assign(appointment, {
          startAt: newSlot.startAt,
          endAt: newSlot.endAt,
          occupiedUntil: newSlot.occupiedUntil,
          serviceBayId: bayId,
          technicianId,
          serviceTypeId: targetServiceTypeIds[0]!,
          serviceTypeIds: targetServiceTypeIds,
        });

        // Replace details
        await this.detailRepo.deleteByAppointmentIdTransactional(manager, appointment.id);
        const details = AppointmentFactory.createDetails(appointment.id, serviceTypes, actor);
        appointment.details = await this.detailRepo.saveDetailsTransactional(manager, details);
        appointment.services = appointment.details;

        changes.startAt = appointment.startAt.toISOString();
        changes.serviceBayId = bayId;
        changes.technicianId = technicianId;
      } else if (dto.technicianId && dto.technicianId !== appointment.technicianId) {
        // Only technician changed: verify both skills qualification and slot availability
        const currentTypeIds = appointment.serviceTypeIds && appointment.serviceTypeIds.length > 0
          ? appointment.serviceTypeIds
          : [appointment.serviceTypeId];

        const serviceTypes = await this.serviceTypeRepo.getByIdsOrFail(
          currentTypeIds.map(String),
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
            `Requested technician ${dto.technicianId} is not available during the scheduled slot`,
            null,
            409,
          );
        }
        appointment.technicianId = dto.technicianId;
        changes.technicianId = dto.technicianId;
      }

      const targetNotes = dto.notes !== undefined ? dto.notes : dto.customerNotes;
      if (targetNotes !== undefined) {
        appointment.notes = targetNotes;
        changes.notes = targetNotes;
      }

      appointment.updated_by = actorIdentifier;
      const saved = await this.appointmentRepo.saveTransactional(manager, appointment);

      await this.events.recordUpdated(manager, saved, actor, changes);

      return saved;
    });
  }
}
