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
import { SwapAppointmentsDto } from '../dto/swap-appointments.dto';
import { ActorContext } from '../types/actor-context.interface';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { AppointmentEventsService } from '../services/appointment-events.service';
import { BookingLockService } from '../services/booking-lock.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { AppointmentAvailabilityRepository } from '../repositories/appointment-availability.repository';
import { ServiceTypeRepository } from '../../service-catalog/repositories/service-type.repository';

export interface SwapResult {
  appointmentA: Appointment;
  appointmentB: Appointment;
}

@Injectable()
export class SwapAppointmentsUseCase {
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
    dto: SwapAppointmentsDto,
    actor: ActorContext,
  ): Promise<SwapResult> {
    if (!actor.tenantId) {
      throw new ForbiddenDomainException('Missing tenant context in session');
    }
    const tenantId = actor.tenantId;

    if (actor.actorType !== 'staff' && actor.actorType !== 'system') {
      throw new ForbiddenDomainException('Only staff or system can swap appointments');
    }

    const idA = dto.appointmentIdA || dto.appointmentId1;
    const idB = dto.appointmentIdB || dto.appointmentId2;

    if (!idA || !idB) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Both appointment identifiers (appointmentIdA and appointmentIdB) are required',
        null,
        400,
      );
    }

    if (idA === idB) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Cannot swap an appointment with itself',
        null,
        400,
      );
    }

    return this.dataSource.transaction(async (manager: EntityManager) => {
      await this.locks.setLocalTimeouts(manager);

      // Lock both appointments in sorted order to prevent deadlocks
      const [firstId, secondId] = [idA, idB].sort();
      const firstAppt = await this.appointmentRepo.findByIdWithLock(manager, firstId, tenantId);
      const secondAppt = await this.appointmentRepo.findByIdWithLock(manager, secondId, tenantId);

      const apptA = firstId === idA ? firstAppt : secondAppt;
      const apptB = firstId === idB ? firstAppt : secondAppt;

      if (!apptA) {
        throw new ResourceNotFoundException(`Appointment not found with ID ${idA}`);
      }
      if (!apptB) {
        throw new ResourceNotFoundException(`Appointment not found with ID ${idB}`);
      }

      if (String(apptA.dealershipId) !== String(apptB.dealershipId)) {
        throw new DomainException(
          ErrorCode.VALIDATION_FAILED,
          'Cannot swap appointments belonging to different dealerships',
          null,
          400,
        );
      }

      Appointment.assertStaffDealership(apptA, actor);
      Appointment.assertSwappable(apptA, apptB);

      await this.locks.lockDealership(manager, apptA.dealershipId);

      // 1. Duration Calculation & Overlap Guard
      const durationA_Ms = apptA.occupiedUntil.getTime() - apptA.startAt.getTime();
      const durationB_Ms = apptB.occupiedUntil.getTime() - apptB.startAt.getTime();
      const serviceDurationA_Ms = apptA.endAt.getTime() - apptA.startAt.getTime();
      const serviceDurationB_Ms = apptB.endAt.getTime() - apptB.startAt.getTime();

      const newStartA = new Date(apptB.startAt.getTime());
      const newOccupiedA = new Date(newStartA.getTime() + durationA_Ms);
      const newEndA = new Date(newStartA.getTime() + serviceDurationA_Ms);

      const newStartB = new Date(apptA.startAt.getTime());
      const newOccupiedB = new Date(newStartB.getTime() + durationB_Ms);
      const newEndB = new Date(newStartB.getTime() + serviceDurationB_Ms);

      // Self-collision: do newPeriodA and newPeriodB overlap?
      const periodsOverlap =
        newStartA.getTime() < newOccupiedB.getTime() && newStartB.getTime() < newOccupiedA.getTime();

      const targetBayA = apptB.serviceBayId;
      const targetTechA = apptB.technicianId;
      const targetBayB = apptA.serviceBayId;
      const targetTechB = apptA.technicianId;

      if (periodsOverlap && (targetBayA === targetBayB || targetTechA === targetTechB)) {
        throw new DomainException(
          ErrorCode.SLOT_SWAP_CONFLICT,
          'Cannot swap appointments: Duration mismatch causes slot overlap between the two appointments',
          null,
          409,
        );
      }

      // Concurrently verify bay and technician availability for both appointments (Promise.all)
      const [isBayAFree, isTechAFree, isBayBFree, isTechBFree] = await Promise.all([
        this.availability.isBayFree(manager, targetBayA, newStartA, newOccupiedA, apptB.id),
        this.availability.isTechnicianFree(manager, targetTechA, newStartA, newOccupiedA, apptB.id),
        this.availability.isBayFree(manager, targetBayB, newStartB, newOccupiedB, apptA.id),
        this.availability.isTechnicianFree(manager, targetTechB, newStartB, newOccupiedB, apptA.id),
      ]);

      if (!isBayAFree || !isTechAFree || !isBayBFree || !isTechBFree) {
        throw new DomainException(
          ErrorCode.SLOT_SWAP_CONFLICT,
          'Cannot swap appointments: Target slots have overlapping bookings with existing workshop schedule',
          null,
          409,
        );
      }

      // Check vehicle overlap for swapped slots
      const [vehicleAOverlap, vehicleBOverlap] = await Promise.all([
        this.availability.hasVehicleOverlap(manager, apptA.vehicleId, newStartA, newOccupiedA, apptA.id),
        this.availability.hasVehicleOverlap(manager, apptB.vehicleId, newStartB, newOccupiedB, apptB.id),
      ]);

      if (vehicleAOverlap || vehicleBOverlap) {
        throw new DomainException(
          ErrorCode.VEHICLE_ALREADY_BOOKED,
          'Cannot swap appointments: Vehicle has an overlapping booking in the swapped time slot',
          null,
          409,
        );
      }

      // 2. Skill Qualification Check (Concurrently fetch service types for both appointments)
      const typeIdsA = apptA.serviceTypeIds && apptA.serviceTypeIds.length > 0
        ? apptA.serviceTypeIds
        : [apptA.serviceTypeId];
      const typeIdsB = apptB.serviceTypeIds && apptB.serviceTypeIds.length > 0
        ? apptB.serviceTypeIds
        : [apptB.serviceTypeId];

      const [serviceTypesA, serviceTypesB] = await Promise.all([
        this.serviceTypeRepo.getByIdsOrFail(typeIdsA.map(String), tenantId, manager),
        this.serviceTypeRepo.getByIdsOrFail(typeIdsB.map(String), tenantId, manager),
      ]);

      const requiredSkillsA = Array.from(new Set(serviceTypesA.map((s) => s.skillId).filter(Boolean) as string[]));
      const requiredSkillsB = Array.from(new Set(serviceTypesB.map((s) => s.skillId).filter(Boolean) as string[]));

      // Concurrently check technician skill matches
      const [techBCanDoB, techACanDoA] = await Promise.all([
        this.availability.technicianHasRequiredSkills(manager, targetTechB, requiredSkillsB),
        this.availability.technicianHasRequiredSkills(manager, targetTechA, requiredSkillsA),
      ]);

      if (!techBCanDoB || !techACanDoA) {
        throw new DomainException(
          ErrorCode.VALIDATION_FAILED,
          'Cannot swap appointments: Technicians do not possess required skills for the swapped service types',
          null,
          400,
        );
      }

      // 3. PostgreSQL GiST 3-Step Shift with Concise Mapping (Object.assign)
      const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;
      const originalStatusA = apptA.status;

      // Step 1: Temporarily set status to SWAPPING to bypass GiST exclusion constraint
      apptA.status = AppointmentStatus.SWAPPING;
      await this.appointmentRepo.saveTransactional(manager, apptA);

      // Step 2: Apply A's new slot to B
      Object.assign(apptB, {
        startAt: newStartB,
        endAt: newEndB,
        occupiedUntil: newOccupiedB,
        serviceBayId: targetBayB,
        technicianId: targetTechB,
        updated_by: actorIdentifier,
      });
      const savedB = await this.appointmentRepo.saveTransactional(manager, apptB);

      // Step 3: Apply B's slot to A and restore status
      Object.assign(apptA, {
        status: originalStatusA,
        startAt: newStartA,
        endAt: newEndA,
        occupiedUntil: newOccupiedA,
        serviceBayId: targetBayA,
        technicianId: targetTechA,
        updated_by: actorIdentifier,
      });
      const savedA = await this.appointmentRepo.saveTransactional(manager, apptA);

      // Concurrently broadcast swapped events
      await Promise.all([
        this.events.recordSwapped(manager, savedA, actor, savedB.id),
        this.events.recordSwapped(manager, savedB, actor, savedA.id),
      ]);

      return {
        appointmentA: savedA,
        appointmentB: savedB,
      };
    });
  }
}
