import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import {
  ForbiddenDomainException,
  LogSpan,
  VehicleAlreadyBookedException,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { ActorContext } from '../types/actor-context.interface';
import { ACTIVE_STATUSES } from '../types/appointment.constants';
import { CustomerResolverService } from '../services/customer-resolver.service';
import { IdempotencyService, hashRequest } from '../services/idempotency.service';
import { BookingLockService } from '../services/booking-lock.service';
import { AppointmentAvailabilityRepository } from '../repositories/appointment-availability.repository';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { AppointmentDetailRepository } from '../repositories/appointment-detail.repository';
import { WorkshopSettingsRepository } from '../../settings/repositories/workshop-settings.repository';
import { ServiceTypeRepository } from '../../service-catalog/repositories/service-type.repository';
import { AppointmentSlotValidator } from '../services/appointment-slot-validator.service';
import { ResourceAllocator } from '../services/resource-allocator.service';
import { ReferenceCodeGenerator } from '../services/reference-code.generator';
import { AppointmentEventsService } from '../services/appointment-events.service';
import { AppointmentFactory } from '../factories/appointment.factory';
import { withRetry } from '../utils/db-retry.util';

/**
 * =========================================================================================
 * CreateAppointmentUseCase — Serialized Appointment Allocation & Concurrency Protection
 * =========================================================================================
 *
 * Clean Orchestrator delegating:
 * - Persistence to AppointmentRepository, AppointmentDetailRepository, WorkshopSettingsRepository, ServiceTypeRepository
 * - Time & Slot Validation to AppointmentSlotValidator
 * - Entity Construction to AppointmentFactory
 * - Resource Allocation to ResourceAllocator & BookingLockService
 */
@Injectable()
export class CreateAppointmentUseCase {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly customers: CustomerResolverService,
    private readonly idempotency: IdempotencyService,
    private readonly locks: BookingLockService,
    private readonly availability: AppointmentAvailabilityRepository,
    private readonly allocator: ResourceAllocator,
    private readonly refCodes: ReferenceCodeGenerator,
    private readonly events: AppointmentEventsService,
    private readonly appointmentRepo: AppointmentRepository,
    private readonly detailRepo: AppointmentDetailRepository,
    private readonly settingsRepo: WorkshopSettingsRepository,
    private readonly serviceTypeRepo: ServiceTypeRepository,
    private readonly slotValidator: AppointmentSlotValidator,
  ) {}

  @LogSpan()
  public async execute(
    dto: CreateAppointmentDto,
    actor: ActorContext,
    idempotencyKey?: string,
  ): Promise<Appointment> {
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context (tenantId) in session');
    }
    const tenantId = actor.tenantId;

    const {
      dealershipId,
      vehicleId,
      serviceTypeIds = [],
      startAt,
      technicianId: targetTechnicianId,
    } = dto;

    // 1. Resolve Customer Identity & Vehicle Ownership OUTSIDE Database Transaction
    const customer = await this.customers.resolve(actor);
    const vehicle = await this.customers.requireVehicle(vehicleId, customer.id, tenantId);

    const requestPayloadHash = idempotencyKey
      ? hashRequest({ ...dto, customerId: customer.id })
      : null;

    // 2. Execute Serialized Booking Transaction wrapped with retry
    return withRetry(() =>
      this.dataSource.transaction(async (manager: EntityManager) => {
        await this.locks.setLocalTimeouts(manager);

        // 3. Check Idempotency Key inside Transaction
        if (idempotencyKey && requestPayloadHash) {
          const replay = await this.idempotency.begin(
            manager,
            actor.actorSub,
            idempotencyKey,
            requestPayloadHash,
          );
          if (replay) {
            const existing = await this.appointmentRepo.findByIdTransactional(manager, replay.id, tenantId);
            if (existing) return existing;
          }
        }

        // 4. Strict Lock Hierarchy: Customer -> Dealership
        await this.locks.lockCustomer(manager, customer.id);
        await this.locks.lockDealership(manager, dealershipId);

        // 5. Load Settings & Service Types via Repositories
        const settings = await this.settingsRepo.getByDealershipIdOrFail(dealershipId, tenantId, manager);

        const serviceTypes = await this.serviceTypeRepo.getByIdsOrFail(
          serviceTypeIds.map(String),
          tenantId,
          manager,
        );

        const requiredSkillIds = Array.from(
          new Set(serviceTypes.map((st) => st.skillId).filter(Boolean) as string[]),
        );

        // 6. Enforce Customer Active Appointment Limit via Repository
        await this.appointmentRepo.assertCustomerActiveLimit(
          manager,
          tenantId,
          customer.id,
          settings.maxActivePerCustomer,
          [...ACTIVE_STATUSES],
        );

        // 7. Validate & Align Requested Slot via Domain Validator
        const serviceSlot = this.slotValidator.resolveAndValidateSlot(settings, serviceTypes, startAt);

        // 8. Check for Overlapping Vehicle Appointments
        if (
          await this.availability.hasVehicleOverlap(
            manager,
            vehicleId,
            serviceSlot.startAt,
            serviceSlot.occupiedUntil,
          )
        ) {
          throw new VehicleAlreadyBookedException(
            'Vehicle already has an overlapping active appointment in this period',
          );
        }

        // 9. Allocate Free Service Bay & Qualified Technician
        const { bayId: allocatedBayId, technicianId: allocatedTechnicianId } =
          await this.allocator.allocate(manager, {
            dealershipId,
            skillId: requiredSkillIds[0] ?? null,
            skillIds: requiredSkillIds,
            requestedTechnicianId: targetTechnicianId,
            slot: serviceSlot,
          });

        // 10. Persist Confirmed Appointment & Details via Factory & Repositories
        const referenceCode = this.refCodes.generate(serviceSlot.startAt);

        const appointmentEntity = AppointmentFactory.createAppointment({
          dto,
          actor,
          customer,
          vehicle,
          slot: serviceSlot,
          serviceTypes,
          allocatedBayId,
          allocatedTechnicianId,
          referenceCode,
          settings,
        });

        const savedAppointment = await this.appointmentRepo.saveTransactional(manager, appointmentEntity);

        const detailEntities = AppointmentFactory.createDetails(savedAppointment.id, serviceTypes, actor);
        const savedDetails = await this.detailRepo.saveDetailsTransactional(manager, detailEntities);
        savedAppointment.details = savedDetails;
        savedAppointment.services = savedDetails;

        // 11. Record Audit Event & Broadcast Real-Time Event on COMMIT
        await this.events.recordCreated(manager, savedAppointment, actor);

        // 12. Complete Idempotency Lease
        if (idempotencyKey) {
          await this.idempotency.complete(manager, actor.actorSub, idempotencyKey, {
            id: savedAppointment.id,
            referenceCode: savedAppointment.referenceCode,
            status: savedAppointment.status,
          });
        }

        return savedAppointment;
      }),
    );
  }
}
