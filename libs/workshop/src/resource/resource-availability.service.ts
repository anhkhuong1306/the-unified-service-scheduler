import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ResourceNotFoundException, ValidationFailedException } from '@app/common';
import {
  IOrganizationDirectoryContract,
  ORGANIZATION_DIRECTORY_CONTRACT,
} from '@app/contracts';
import { WorkshopSettings } from '../settings/workshop-settings.entity';
import { ServiceType } from '../service-catalog/service-type.entity';
import { CandidateSlot, SlotPolicy } from '../appointment/domain/slot-policy';
import { AppointmentAvailabilityRepository } from '../appointment/repositories/appointment-availability.repository';
import { Clock } from '../appointment/services/clock';
import {
  AggregatedSlotDto,
  AvailabilityResponseDto,
  AvailableServiceTypeSummaryDto,
  AvailableTechnicianDto,
  DealershipAvailableSlotsResponseDto,
  SlotAvailabilityDto,
  SlotTechniciansResponseDto,
} from './dto/slot-availability.dto';

export {
  AggregatedSlotDto,
  AvailabilityResponseDto,
  AvailableServiceTypeSummaryDto,
  AvailableTechnicianDto,
  DealershipAvailableSlotsResponseDto,
  SlotAvailabilityDto,
  SlotTechniciansResponseDto,
};

/**
 * =========================================================================================
 * ResourceAvailabilityService — Daily Capacity Aggregation & Slot Availability Query
 * =========================================================================================
 *
 * DESIGN INTENT & ARCHITECTURAL PURPOSE:
 * 1. Customer & Staff Real-time Availability Query:
 *    - Powers booking calendars by identifying vacant service bays and qualified technicians.
 * 2. 1-Query Batch Aggregation (Eliminating N+1 Queries - Section G3/G4):
 *    - In legacy systems, checking 40 slots per day meant executing 40 * 2 = 80 distinct SQL queries.
 *    - This refactored service delegates batch aggregation to `countFreePerSlot` and `findFreeTechniciansPerSlot`,
 *      computing free counts and available technician lists for ALL slots in a single round-trip.
 * 3. Customer Technician Selection:
 *    - Every candidate slot includes `availableTechnicians` so customers can pick their preferred technician.
 * 4. Domain Synchronization with Booking Use Case:
 *    - Delegates time boundary calculation and timezone translation to `SlotPolicy`, ensuring the
 *      availability calendar and booking mutation share identical rules.
 */
@Injectable()
export class ResourceAvailabilityService {
  public constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(WorkshopSettings)
    private readonly settingsRepo: Repository<WorkshopSettings>,
    @InjectRepository(ServiceType)
    private readonly serviceTypeRepo: Repository<ServiceType>,
    private readonly slotPolicy: SlotPolicy,
    private readonly availability: AppointmentAvailabilityRepository,
    private readonly clock: Clock,
    @Optional()
    @Inject(ORGANIZATION_DIRECTORY_CONTRACT)
    private readonly orgDirectory?: IOrganizationDirectoryContract,
  ) {}

  /**
   * Calculates slot availability, remaining capacity, and available technicians across a single calendar day
   * for a specific service type.
   *
   * @param tenantId Multi-tenant boundary identifier.
   * @param dealershipId Target workshop dealership identifier.
   * @param serviceTypeId Target service type identifier.
   * @param date Target date string in YYYY-MM-DD format.
   * @returns Availability breakdown detailing each slot's capacity, status, and free technicians.
   * @throws ResourceNotFoundException If workshop settings or service type do not exist under this tenant.
   */
  public async getAvailability(
    tenantId: string,
    dealershipId: string,
    serviceTypeId: string,
    date: string,
  ): Promise<AvailabilityResponseDto> {
    const settings = await this.settingsRepo.findOne({
      where: { dealershipId, tenantId },
    });
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop operational settings not found for dealership ${dealershipId}`,
      );
    }

    const serviceType = await this.serviceTypeRepo.findOne({
      where: { id: serviceTypeId, tenantId },
    });
    if (!serviceType) {
      throw new ResourceNotFoundException(`Service type ${serviceTypeId} not found`);
    }

    const candidateSlots: CandidateSlot[] = this.slotPolicy.generate({
      settings,
      durationMinutes: serviceType.durationMinutes,
      date,
      now: this.clock.now(),
    });

    const activeCandidateSlots = candidateSlots.filter((slot) => slot.meetsLeadTime);

    const [slotCapacityMap, slotTechMap] = await Promise.all([
      this.availability.countFreePerSlot(this.dataSource, {
        dealershipId,
        skillId: serviceType.skillId,
        slots: activeCandidateSlots,
      }),
      this.availability.findFreeTechniciansPerSlot(this.dataSource, {
        dealershipId,
        skillId: serviceType.skillId,
        slots: activeCandidateSlots,
      }),
    ]);

    return {
      dealershipId,
      serviceTypeId,
      date,
      slotMinutes: settings.slotMinutes,
      durationMinutes: serviceType.durationMinutes,
      bufferMinutes: settings.bufferMinutes,
      slots: candidateSlots.map((candidateSlot) => {
        const epochKey = candidateSlot.startAt.getTime();
        const capacityData = slotCapacityMap.get(epochKey) ?? {
          freeBays: 0,
          freeTechnicians: 0,
        };
        const availableTechnicians = slotTechMap.get(epochKey) ?? [];
        const remainingCapacity = Math.min(capacityData.freeBays, capacityData.freeTechnicians);

        return {
          startAt: candidateSlot.startAt.toISOString(),
          endAt: candidateSlot.endAt.toISOString(),
          occupiedUntil: candidateSlot.occupiedUntil.toISOString(),
          freeBays: capacityData.freeBays,
          freeTechnicians: capacityData.freeTechnicians,
          remainingCapacity,
          isAvailable: candidateSlot.meetsLeadTime && remainingCapacity > 0,
          availableTechnicians,
        };
      }),
    };
  }

  /**
   * Retrieves all candidate slots and bookable service types for a dealership on a given date,
   * organized by slot with available technicians directly alongside startAt, and bookable service types.
   *
   * @param tenantId Multi-tenant boundary identifier.
   * @param dealershipId Target workshop dealership identifier.
   * @param date Target date string in YYYY-MM-DD format.
   * @param serviceTypeId Optional service type filter.
   */
  public async getDealershipAvailableSlots(
    tenantId: string,
    dealershipId: string,
    date: string,
    serviceTypeId?: string,
  ): Promise<DealershipAvailableSlotsResponseDto> {
    const settings = await this.settingsRepo.findOne({
      where: { dealershipId, tenantId },
    });
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop operational settings not found for dealership ${dealershipId}`,
      );
    }

    let dealershipName = `Dealership ${dealershipId}`;
    if (this.orgDirectory) {
      const dealership = await this.orgDirectory.findDealershipById(dealershipId, tenantId);
      if (dealership?.name) {
        dealershipName = dealership.name;
      }
    }

    const now = this.clock.now();

    // 1. Generate baseline operational daily slot grid
    const baseDailySlots = this.slotPolicy.generateBaseDailySlots({
      settings,
      date,
      now,
    });

    // 2. Pre-query available technicians across the base slot intervals in 1 batch query
    const baseSlotIntervals = baseDailySlots
      .filter((s) => s.meetsLeadTime)
      .map((s) => ({
        startAt: s.startAt,
        occupiedUntil: new Date(s.startAt.getTime() + settings.slotMinutes * 60_000),
      }));

    const baseSlotTechMap = await this.availability.findFreeTechniciansPerSlot(this.dataSource, {
      dealershipId,
      skillId: null, // Any active qualified technician free at this slot
      slots: baseSlotIntervals,
    });

    // 3. Load active service types (optionally filtered)
    let serviceTypes: ServiceType[];
    if (serviceTypeId) {
      const single = await this.serviceTypeRepo.findOne({
        where: { id: serviceTypeId, tenantId },
      });
      if (!single) {
        throw new ResourceNotFoundException(`Service type ${serviceTypeId} not found`);
      }
      serviceTypes = [single];
    } else {
      serviceTypes = await this.serviceTypeRepo.find({
        where: { tenantId },
        order: { id: 'ASC' },
      });
    }

    // 4. Compute candidate slots, remaining capacity, and qualified technicians for each service type
    const serviceTypeResults: Array<{
      serviceType: ServiceType;
      candidateSlots: CandidateSlot[];
      capacityMap: Map<number, { freeBays: number; freeTechnicians: number }>;
      techMap: Map<number, AvailableTechnicianDto[]>;
    }> = [];

    for (const st of serviceTypes) {
      const candidateSlots = this.slotPolicy.generate({
        settings,
        durationMinutes: st.durationMinutes,
        date,
        now,
      });

      const activeSlots = candidateSlots.filter((slot) => slot.meetsLeadTime);

      const [capacityMap, techMap] = await Promise.all([
        this.availability.countFreePerSlot(this.dataSource, {
          dealershipId,
          skillId: st.skillId,
          slots: activeSlots,
        }),
        this.availability.findFreeTechniciansPerSlot(this.dataSource, {
          dealershipId,
          skillId: st.skillId,
          slots: activeSlots,
        }),
      ]);

      serviceTypeResults.push({
        serviceType: st,
        candidateSlots,
        capacityMap,
        techMap,
      });
    }

    // 5. Assemble aggregated slots matching customer UI schema:
    // Slot -> { startAt, displayTime, meetsLeadTime, availableTechnicians, availableServiceTypes }
    const aggregatedSlots: AggregatedSlotDto[] = baseDailySlots.map((baseSlot) => {
      const epochKey = baseSlot.startAt.getTime();
      const slotTechnicians = baseSlotTechMap.get(epochKey) ?? [];

      const availableServiceTypes: AvailableServiceTypeSummaryDto[] = [];

      if (baseSlot.meetsLeadTime) {
        for (const stResult of serviceTypeResults) {
          const matchingCandidate = stResult.candidateSlots.find(
            (cs) => cs.startAt.getTime() === epochKey,
          );

          if (matchingCandidate) {
            const cap = stResult.capacityMap.get(epochKey) ?? { freeBays: 0, freeTechnicians: 0 };
            const remainingCapacity = Math.min(cap.freeBays, cap.freeTechnicians);
            const qualifiedTechs = stResult.techMap.get(epochKey) ?? [];

            if (remainingCapacity > 0) {
              availableServiceTypes.push({
                serviceTypeId: stResult.serviceType.id,
                code: stResult.serviceType.code,
                name: stResult.serviceType.name,
                durationMinutes: stResult.serviceType.durationMinutes,
                endAt: matchingCandidate.endAt.toISOString(),
                occupiedUntil: matchingCandidate.occupiedUntil.toISOString(),
                remainingCapacity,
                availableTechnicians: qualifiedTechs,
              });
            }
          }
        }
      }

      return {
        startAt: baseSlot.startAt.toISOString(),
        displayTime: baseSlot.displayTime,
        meetsLeadTime: baseSlot.meetsLeadTime,
        availableTechnicians: slotTechnicians,
        availableServiceTypes,
      };
    });

    return {
      dealershipId,
      dealershipName,
      date,
      timezone: settings.timezone,
      slotMinutes: settings.slotMinutes,
      slots: aggregatedSlots,
    };
  }

  /**
   * Retrieves all free qualified technicians for a specific single slot start time and service type.
   * Corresponds to `GET /v1/dealerships/{id}/technicians?service_type_id=&start_at=` (SYSTEM_DESIGN.md §9.2).
   */
  public async getTechniciansForSlot(
    tenantId: string,
    dealershipId: string,
    serviceTypeId: string,
    startAtIso: string,
  ): Promise<SlotTechniciansResponseDto> {
    const settings = await this.settingsRepo.findOne({
      where: { dealershipId, tenantId },
    });
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop operational settings not found for dealership ${dealershipId}`,
      );
    }

    const serviceType = await this.serviceTypeRepo.findOne({
      where: { id: serviceTypeId, tenantId },
    });
    if (!serviceType) {
      throw new ResourceNotFoundException(`Service type ${serviceTypeId} not found`);
    }

    const startAt = new Date(startAtIso);
    if (isNaN(startAt.getTime())) {
      throw new ValidationFailedException(
        `Invalid startAt timestamp '${startAtIso}'. Expected ISO 8601 UTC string (e.g. '2026-11-01T01:00:00.000Z')`,
      );
    }

    const totalMinutes = serviceType.durationMinutes + settings.bufferMinutes;
    const occupiedUntil = new Date(startAt.getTime() + totalMinutes * 60 * 1000);

    const technicians = await this.availability.findFreeTechniciansForWindow(this.dataSource, {
      dealershipId,
      skillId: serviceType.skillId,
      from: startAt,
      to: occupiedUntil,
    });

    return {
      dealershipId,
      serviceTypeId,
      startAt: startAt.toISOString(),
      occupiedUntil: occupiedUntil.toISOString(),
      technicians,
    };
  }
}
