import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { DateTime } from 'luxon';
import {
  ActiveAppointmentLimitReachedException,
  DomainException,
  ErrorCode,
  ForbiddenDomainException,
  LogSpan,
  ResourceNotFoundException,
  VehicleAlreadyBookedException,
} from '@app/common';
import { WorkshopSettings } from '../settings/workshop-settings.entity';
import { ServiceType } from '../service-catalog/service-type.entity';
import { AppointmentStatus } from './appointment-status.enum';
import { Appointment } from './appointment.entity';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ActorContext } from './actor-context';
import { ACTIVE_STATUSES } from './appointment.constants';
import { CandidateSlot, SlotPolicy } from './domain/slot-policy';
import { CustomerResolverService } from './services/customer-resolver.service';
import { IdempotencyService, hashRequest } from './services/idempotency.service';
import { BookingLockService } from './services/booking-lock.service';
import { AppointmentAvailabilityRepository } from './repositories/appointment-availability.repository';
import { ResourceAllocator } from './services/resource-allocator.service';
import { ReferenceCodeGenerator } from './services/reference-code.generator';
import { AppointmentEventsService } from './services/appointment-events.service';
import { Clock } from './services/clock';
import { withRetry } from './utils/db-retry.util';

/**
 * =========================================================================================
 * CreateAppointmentUseCase — Serialized Appointment Allocation & Concurrency Protection
 * =========================================================================================
 *
 * DESIGN INTENT & ARCHITECTURAL PURPOSE:
 * 1. Two-Tier Concurrency Protection (Zero Double-Booking):
 *    - Tier 1 (Application): PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`)
 *      strictly serialize resource allocation per dealership, preventing race conditions before they occur.
 *    - Tier 2 (Storage): Three GiST Exclusion Constraints (`no_bay_overlap`, `no_technician_overlap`,
 *      `no_vehicle_overlap`) on `tstzrange(start_at, occupied_until, '[)')` serve as an unbreakable DB safety net.
 * 2. Strict Lock Hierarchy (Preventing Deadlocks & Active-Limit Bypass across Dealerships - Case 6):
 *    - If a customer concurrently books at Dealership A and Dealership B, independent dealership locks would allow
 *      both to succeed, breaching `max_active_per_customer`.
 *    - Solution: Enforce strict acquisition order: lock customer FIRST, then lock dealership:
 *      `lockCustomer(customerId) -> lockDealership(dealershipId)`.
 * 3. Atomic Idempotency Replay (Zero Duplicate Appointments - Case 11 / A1, A2):
 *    - Handled within the same database transaction using `INSERT ... ON CONFLICT`.
 *    - Replay requests return the existing appointment record immediately without creating a second booking.
 * 4. Slot Policy Synchronization:
 *    - Validates grid alignment, local timezone offset, operating hours, and minimum lead time using `SlotPolicy`.
 * 5. TypeORM Connection Pool Boundary:
 *    - Every query within the transaction executes exclusively via `transactionManager: EntityManager`.
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
    private readonly clock: Clock,
    private readonly slotPolicy: SlotPolicy,
  ) {}

  /**
   * Executes the serialized booking appointment use case.
   *
   * @param dto Data Transfer Object containing booking parameters (dealershipId, vehicleId, serviceTypeId, startAt, notes).
   * @param actor Authenticated caller context (JWT subject, actor type, tenantId).
   * @param idempotencyKey Optional unique key from HTTP header 'Idempotency-Key' preventing duplicate submissions.
   * @returns Persisted Appointment record in CONFIRMED or PENDING status.
   * @throws ForbiddenDomainException If tenant context is missing or customer identity cannot be resolved.
   * @throws ResourceNotFoundException If vehicle, workshop settings, or service type do not exist.
   * @throws ActiveAppointmentLimitReachedException If customer has already reached the maximum active appointments limit.
   * @throws VehicleAlreadyBookedException If the vehicle already has an overlapping active appointment in this window.
   * @throws SlotUnavailableException If no bay or qualified technician is available for the requested slot.
   */
  @LogSpan()
  public async execute(
    dto: CreateAppointmentDto,
    actor: ActorContext,
    idempotencyKey?: string,
  ): Promise<Appointment> {
    // A9: Multi-tenancy guard - prohibit implicit fallback to default tenant
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context (tenantId) in session');
    }
    const tenantId = actor.tenantId;

    // 1. Resolve Customer Identity and Verify Vehicle Ownership OUTSIDE Database Transaction
    // (Preserves connection pool capacity by avoiding holding DB connections while awaiting external CRM)
    const customer = await this.customers.resolve(actor);
    const vehicle = await this.customers.requireVehicle(dto.vehicleId, customer.id, tenantId);

    // Compute deterministic SHA-256 hash of the request payload to guard against idempotency key reuse with different payload
    const requestPayloadHash = idempotencyKey
      ? hashRequest({ ...dto, customerId: customer.id })
      : null;

    // 2. Execute Serialized Booking Transaction wrapped with automatic transient error retry (withRetry)
    return withRetry(() =>
      this.dataSource.transaction(async (transactionManager: EntityManager) => {
        // Enforce strict timeouts on the transactional connection:
        // lock_timeout: Abort if advisory lock acquisition waits longer than 2s (55P03)
        // statement_timeout: Abort if any individual statement runs longer than 5s (57014)
        await this.locks.setLocalTimeouts(transactionManager);

        // 3. Atomically Begin / Check Idempotency Key inside Transaction (A1, A2)
        if (idempotencyKey && requestPayloadHash) {
          const replayResponse = await this.idempotency.begin(
            transactionManager,
            actor.actorSub,
            idempotencyKey,
            requestPayloadHash,
          );
          if (replayResponse) {
            // Replay detected: return previously confirmed appointment without re-allocating or re-inserting
            return transactionManager.findOneOrFail(Appointment, {
              where: { id: replayResponse.id, tenantId },
            });
          }
        }

        // 4. Strict Lock Hierarchy (A4, D5)
        // Step 4.1: Lock customer first to enforce system-wide active appointment limits
        await this.locks.lockCustomer(transactionManager, customer.id);

        // Step 4.2: Lock dealership to serialize bay & technician allocation within this workshop
        await this.locks.lockDealership(transactionManager, dto.dealershipId);

        // 5. Load Workshop Settings and Service Type under the protection of the advisory locks
        const settings = await this.loadSettings(transactionManager, dto.dealershipId, tenantId);
        const serviceType = await this.loadServiceType(transactionManager, dto.serviceTypeId, tenantId);

        // 6. Enforce System-Wide Active Appointment Limits per Customer
        // maxActivePerCustomer: Default 3 active appointments (PENDING, CONFIRMED, CHECKED_IN, IN_PROGRESS)
        await this.assertActiveLimit(
          transactionManager,
          tenantId,
          customer.id,
          settings.maxActivePerCustomer,
        );

        // 7. Validate & Align Request with Dealership SlotPolicy (G2, G5)
        // startAt: Requested start timestamp in ISO 8601 UTC format
        // @example '2026-11-01T01:00:00.000Z'
        const requestedStartTime = new Date(dto.startAt);
        if (Number.isNaN(requestedStartTime.getTime())) {
          throw new DomainException(
            ErrorCode.VALIDATION_FAILED,
            'Invalid startAt date format (expected ISO 8601 UTC string, e.g. 2026-11-01T01:00:00.000Z)',
            null,
            400,
          );
        }

        // Convert UTC timestamp to calendar date YYYY-MM-DD in the workshop's local timezone
        // @example '2026-11-01' for '2026-11-01T01:00:00.000Z' in 'Asia/Ho_Chi_Minh'
        const targetDateInWorkshopTimezone = DateTime.fromJSDate(requestedStartTime, {
          zone: settings.timezone,
        }).toISODate();

        if (!targetDateInWorkshopTimezone) {
          throw new DomainException(
            ErrorCode.VALIDATION_FAILED,
            'Cannot resolve booking date in dealership local timezone',
            null,
            400,
          );
        }

        // Generate all valid slots for the day using SlotPolicy
        const candidateSlots: CandidateSlot[] = this.slotPolicy.generate({
          settings,
          durationMinutes: serviceType.durationMinutes,
          now: this.clock.now(),
          date: targetDateInWorkshopTimezone,
        });

        // Ensure requested time aligns exactly with an eligible candidate slot meeting advance notice
        const matchedCandidateSlot = candidateSlots.find(
          (candidate) =>
            candidate.meetsLeadTime &&
            candidate.startAt.getTime() === requestedStartTime.getTime(),
        );

        if (!matchedCandidateSlot) {
          throw new DomainException(
            ErrorCode.VALIDATION_FAILED,
            'startAt is not a bookable slot (must align with slot-grid, fall within operating hours, and meet minimum advance notice leadTime)',
            null,
            400,
          );
        }

        // serviceSlot: Three standardized timestamps:
        // - startAt: Service admission timestamp
        // - endAt: Work completion timestamp (startAt + durationMinutes)
        // - occupiedUntil: Bay release timestamp (endAt + bufferMinutes)
        const serviceSlot = {
          startAt: matchedCandidateSlot.startAt,
          endAt: matchedCandidateSlot.endAt,
          occupiedUntil: matchedCandidateSlot.occupiedUntil,
        };

        // 8. Check for Overlapping Active Appointments for this Vehicle
        if (
          await this.availability.hasVehicleOverlap(
            transactionManager,
            dto.vehicleId,
            serviceSlot.startAt,
            serviceSlot.occupiedUntil,
          )
        ) {
          throw new VehicleAlreadyBookedException(
            'Vehicle already has an overlapping active appointment in this period',
          );
        }

        // 9. Allocate Free Service Bay and Qualified Technician (E3, E6)
        const { bayId: allocatedBayId, technicianId: allocatedTechnicianId } =
          await this.allocator.allocate(transactionManager, {
            dealershipId: dto.dealershipId,
            skillId: serviceType.skillId,
            requestedTechnicianId: dto.technicianId,
            slot: serviceSlot,
          });

        // 10. Persist Confirmed Appointment
        // referenceCode: Cryptographically secure reference code (e.g., 'APT-20261101-ABCD1234')
        const referenceCode = this.refCodes.generate(serviceSlot.startAt);

        // requiresApproval: If dealership enforces manual review -> PENDING; otherwise -> CONFIRMED
        const initialStatus = settings.requiresApproval
          ? AppointmentStatus.PENDING
          : AppointmentStatus.CONFIRMED;

        const newAppointmentEntity = transactionManager.create(Appointment, {
          tenantId,
          referenceCode,
          dealershipId: dto.dealershipId,
          customerId: customer.id,
          vehicleId: dto.vehicleId,
          serviceTypeId: dto.serviceTypeId,
          serviceBayId: allocatedBayId,
          technicianId: allocatedTechnicianId,
          customerName: customer.name || vehicle.customerName,
          vehiclePlate: vehicle.licensePlate,
          vehicleLabel: vehicle.vehicleLabel,
          startAt: serviceSlot.startAt,
          endAt: serviceSlot.endAt,
          occupiedUntil: serviceSlot.occupiedUntil,
          status: initialStatus,
          notes: dto.notes ?? null,
          version: 1, // Optimistic locking version
          createdBy: actor.actorSub,
          updatedBy: actor.actorSub,
        });

        const savedAppointment = await transactionManager.save(Appointment, newAppointmentEntity);

        // 11. Record Audit Event & Broadcast Real-Time Event on COMMIT (pg_notify)
        await this.events.recordCreated(transactionManager, savedAppointment, actor);

        // 12. Atomically Complete Idempotency Lease inside Transaction (Case 11)
        if (idempotencyKey) {
          await this.idempotency.complete(transactionManager, actor.actorSub, idempotencyKey, {
            id: savedAppointment.id,
            referenceCode: savedAppointment.referenceCode,
            status: savedAppointment.status,
          });
        }

        return savedAppointment;
      }),
    );
  }

  /**
   * Loads WorkshopSettings within the transactional connection.
   */
  private async loadSettings(
    transactionManager: EntityManager,
    dealershipId: string,
    tenantId: string,
  ): Promise<WorkshopSettings> {
    const settings = await transactionManager.findOne(WorkshopSettings, {
      where: { dealershipId, tenantId },
    });
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop settings not found for dealership ${dealershipId}`,
      );
    }
    return settings;
  }

  /**
   * Loads ServiceType within the transactional connection.
   */
  private async loadServiceType(
    transactionManager: EntityManager,
    serviceTypeId: string,
    tenantId: string,
  ): Promise<ServiceType> {
    const serviceType = await transactionManager.findOne(ServiceType, {
      where: { id: serviceTypeId, tenantId },
    });
    if (!serviceType) {
      throw new ResourceNotFoundException(`Service type ${serviceTypeId} not found`);
    }
    return serviceType;
  }

  /**
   * Enforces customer active appointment limits across all dealerships.
   */
  private async assertActiveLimit(
    transactionManager: EntityManager,
    tenantId: string,
    customerId: string,
    maxActiveAllowed: number,
  ): Promise<void> {
    const currentActiveAppointmentsCount = await transactionManager.count(Appointment, {
      where: { tenantId, customerId, status: In([...ACTIVE_STATUSES]) },
    });
    if (currentActiveAppointmentsCount >= maxActiveAllowed) {
      throw new ActiveAppointmentLimitReachedException(
        `Maximum active appointments limit (${maxActiveAllowed}) reached for this customer`,
      );
    }
  }
}
