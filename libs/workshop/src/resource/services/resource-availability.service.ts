import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  getTodayDateString,
  parseIds,
  ResourceNotFoundException,
  ValidationFailedException,
} from '@app/common';
import {
  IOrganizationDirectoryContract,
  ORGANIZATION_DIRECTORY_CONTRACT,
} from '@app/contracts';
import { WorkshopSettings } from '../../settings/entities/workshop-settings.entity';
import { WorkshopCacheService } from '../../cache/workshop-cache.service';
import { ServiceType } from '../../service-catalog/entities/service-type.entity';
import { CandidateSlot, SlotPolicy } from '../../appointment/domain/slot-policy';
import { AppointmentAvailabilityRepository } from '../../appointment/repositories/appointment-availability.repository';
import { Clock } from '../../appointment/services/clock';
import { WorkshopSettingsRepository } from '../../settings/repositories/workshop-settings.repository';
import { ServiceTypeRepository } from '../../service-catalog/repositories/service-type.repository';
import {
  AggregatedSlotDto,
  AvailableServiceTypeSummaryDto,
  AvailableTechnicianDto,
  DealershipAvailableSlotsWithMetaDto,
  SlotTechniciansResponseDto,
} from '../dto/slot-availability.dto';
import { AvailableSlotsFilterOptions } from '../types';

/**
 * =========================================================================================
 * ResourceAvailabilityService — Daily Capacity Aggregation & Slot Availability Query
 * =========================================================================================
 */
@Injectable()
export class ResourceAvailabilityService {
  public constructor(
    private readonly dataSource: DataSource,
    private readonly settingsRepo: WorkshopSettingsRepository,
    private readonly serviceTypeRepo: ServiceTypeRepository,
    private readonly slotPolicy: SlotPolicy,
    private readonly availability: AppointmentAvailabilityRepository,
    private readonly clock: Clock,
    @Optional()
    @Inject(ORGANIZATION_DIRECTORY_CONTRACT)
    private readonly orgDirectory?: IOrganizationDirectoryContract,
    @Optional()
    private readonly workshopCache?: WorkshopCacheService,
  ) {}

  private async loadSettings(dealershipId: string, tenantId: string): Promise<WorkshopSettings | null> {
    if (this.workshopCache) {
      const cached = await this.workshopCache.getSettings(dealershipId, tenantId);
      if (cached) {
        return cached;
      }
    }
    return this.settingsRepo.findByDealershipId(dealershipId, tenantId);
  }

  /**
   * Retrieves all candidate slots and bookable service types for a dealership on a given date,
   * organized by slot with available technicians directly alongside startAt, and bookable service types.
   *
   * Supports:
   * - `date`: optional, defaults to current day if omitted
   * - `serviceTypeIds`: optional array/comma-separated, defaults to all if omitted
   * - `technicianIds`: optional array/comma-separated, defaults to all if omitted
   * - `page` & `limit`: offset pagination on candidate slots, default limit 10
   */
  public async getDealershipAvailableSlots(
    tenantId: string,
    dealershipId: string,
    dateOrOptions?: string | AvailableSlotsFilterOptions,
    legacyServiceTypeId?: string,
  ): Promise<DealershipAvailableSlotsWithMetaDto> {
    const settings = await this.loadSettings(dealershipId, tenantId);
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop operational settings not found for dealership ${dealershipId}`,
      );
    }

    const options: AvailableSlotsFilterOptions =
      typeof dateOrOptions === 'object' && dateOrOptions !== null
        ? dateOrOptions
        : {
            date: typeof dateOrOptions === 'string' ? dateOrOptions : undefined,
            serviceTypeIds: legacyServiceTypeId,
          };

    const now = this.clock.now();
    const targetDate = options.date?.trim() || getTodayDateString(now, settings.timezone);

    let dealershipName = `Dealership ${dealershipId}`;
    if (this.orgDirectory) {
      const dealership = await this.orgDirectory.findDealershipById(dealershipId, tenantId);
      if (dealership?.name) {
        dealershipName = dealership.name;
      }
    }

    // 1. Generate baseline operational daily slot grid
    const baseDailySlots = this.slotPolicy.generateBaseDailySlots({
      settings,
      date: targetDate,
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
      skillId: null,
      slots: baseSlotIntervals,
    });

    // 3. Load active service types (optionally filtered by service_type_ids)
    const filterServiceTypeIds = parseIds(options.serviceTypeIds);
    let serviceTypes: ServiceType[];
    if (filterServiceTypeIds && filterServiceTypeIds.length > 0) {
      serviceTypes = await this.serviceTypeRepo.findByIds(filterServiceTypeIds, tenantId);
    } else {
      serviceTypes = await this.serviceTypeRepo.findAll(tenantId);
    }

    // 4. Technician filter setup (technician_ids)
    const filterTechnicianIds = parseIds(options.technicianIds);
    const techIdSet = filterTechnicianIds ? new Set(filterTechnicianIds) : null;

    // 5. Compute candidate slots, remaining capacity, and qualified technicians for each service type
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
        date: targetDate,
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

    // 6. Assemble all candidate slots
    const allAggregatedSlots: AggregatedSlotDto[] = baseDailySlots.map((baseSlot) => {
      const epochKey = baseSlot.startAt.getTime();
      let slotTechnicians = baseSlotTechMap.get(epochKey) ?? [];

      if (techIdSet) {
        slotTechnicians = slotTechnicians.filter((t) => techIdSet.has(t.id));
      }

      const availableServiceTypes: AvailableServiceTypeSummaryDto[] = [];

      if (baseSlot.meetsLeadTime) {
        for (const stResult of serviceTypeResults) {
          const matchingCandidate = stResult.candidateSlots.find(
            (cs) => cs.startAt.getTime() === epochKey,
          );

          if (matchingCandidate) {
            const cap = stResult.capacityMap.get(epochKey) ?? { freeBays: 0, freeTechnicians: 0 };
            let qualifiedTechs = stResult.techMap.get(epochKey) ?? [];

            if (techIdSet) {
              qualifiedTechs = qualifiedTechs.filter((t) => techIdSet.has(t.id));
            }

            const effectiveTechCapacity = techIdSet ? qualifiedTechs.length : cap.freeTechnicians;
            const remainingCapacity = Math.min(cap.freeBays, effectiveTechCapacity);

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

    // 7. Offset pagination on candidate slots
    const page = Math.max(1, Number(options.page || 1));
    const limit = Math.max(1, Number(options.limit || 10));
    const total = allAggregatedSlots.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedSlots = allAggregatedSlots.slice(startIndex, startIndex + limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      dealershipId,
      dealershipName,
      date: targetDate,
      timezone: settings.timezone,
      slotMinutes: settings.slotMinutes,
      slots: paginatedSlots,
      meta: {
        page,
        per_page: limit,
        limit,
        total,
        totalPages,
        total_pages: totalPages,
        hasNext,
        has_next: hasNext,
        hasPrev,
        has_prev: hasPrev,
      },
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
    const settings = await this.loadSettings(dealershipId, tenantId);
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop operational settings not found for dealership ${dealershipId}`,
      );
    }

    const serviceType = await this.serviceTypeRepo.findById(serviceTypeId, tenantId);
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
