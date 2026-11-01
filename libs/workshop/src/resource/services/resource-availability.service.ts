import { Inject, Injectable, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResourceNotFoundException, ValidationFailedException } from '@app/common';
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
  AvailabilityResponseDto,
  AvailableServiceTypeSummaryDto,
  AvailableTechnicianDto,
  DealershipAvailableSlotsResponseDto,
  SlotAvailabilityDto,
  SlotTechniciansResponseDto,
} from '../dto/slot-availability.dto';

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
   * Calculates slot availability, remaining capacity, and available technicians across a single calendar day
   * for a specific service type.
   */
  public async getAvailability(
    tenantId: string,
    dealershipId: string,
    serviceTypeId: string,
    date: string,
  ): Promise<AvailabilityResponseDto> {
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

    const slots: SlotAvailabilityDto[] = candidateSlots.map((candidate) => {
      const isPastOrViolatesLeadTime = !candidate.meetsLeadTime;

      if (isPastOrViolatesLeadTime) {
        return {
          startAt: candidate.startAt.toISOString(),
          endAt: candidate.endAt.toISOString(),
          status: 'UNAVAILABLE' as const,
          remainingCapacity: 0,
          totalCapacity: 0,
          availableTechnicians: [],
        };
      }

      const key = candidate.startAt.toISOString();
      const capacity = slotCapacityMap.get(key) ?? { remainingCapacity: 0, totalCapacity: 0 };
      const availableTechs = slotTechMap.get(key) ?? [];

      const isAvailable = capacity.remainingCapacity > 0;

      return {
        startAt: candidate.startAt.toISOString(),
        endAt: candidate.endAt.toISOString(),
        status: isAvailable ? ('AVAILABLE' as const) : ('UNAVAILABLE' as const),
        remainingCapacity: capacity.remainingCapacity,
        totalCapacity: capacity.totalCapacity,
        availableTechnicians: availableTechs.map((tech) => ({
          id: tech.id,
          name: tech.name,
        })),
      };
    });

    return {
      dealershipId,
      serviceTypeId,
      date,
      timezone: settings.timezone,
      slotMinutes: settings.slotMinutes,
      slots,
    };
  }

  /**
   * Retrieves aggregated slots and per-service-type availability across an entire dealership.
   */
  public async getDealershipAvailableSlots(
    tenantId: string,
    dealershipId: string,
    date: string,
    serviceTypeId?: string,
  ): Promise<DealershipAvailableSlotsResponseDto> {
    const settings = await this.loadSettings(dealershipId, tenantId);
    if (!settings) {
      throw new ResourceNotFoundException(
        `Workshop operational settings not found for dealership ${dealershipId}`,
      );
    }

    let dealershipName = '';
    let dealershipTimezone = settings.timezone;
    if (this.orgDirectory) {
      try {
        const d = await this.orgDirectory.findDealershipById(dealershipId, tenantId);
        if (d) {
          dealershipName = d.name;
          dealershipTimezone = d.timezone || settings.timezone;
        }
      } catch {
        // Fallback to settings
      }
    }

    const baseDailySlots = this.slotPolicy.generateBaseDailySlots({
      settings,
      date,
      now: this.clock.now(),
    });

    const baseSlotIntervals = baseDailySlots
      .filter((s) => s.meetsLeadTime)
      .map((s) => ({
        startAt: s.startAt,
        endAt: new Date(s.startAt.getTime() + settings.slotMinutes * 60_000),
        occupiedUntil: new Date(s.startAt.getTime() + settings.slotMinutes * 60_000),
      }));

    const baseSlotTechMap = await this.availability.findFreeTechniciansPerSlot(this.dataSource, {
      dealershipId,
      skillId: null,
      slots: baseSlotIntervals,
    });

    let serviceTypes: ServiceType[];
    if (serviceTypeId) {
      const single = await this.serviceTypeRepo.findById(serviceTypeId, tenantId);
      if (!single) {
        throw new ResourceNotFoundException(`Service type ${serviceTypeId} not found`);
      }
      serviceTypes = [single];
    } else {
      serviceTypes = await this.serviceTypeRepo.findAll(tenantId);
    }

    const serviceTypesMap = new Map<string, AvailableServiceTypeSummaryDto>();
    for (const st of serviceTypes) {
      serviceTypesMap.set(st.id, {
        id: st.id,
        code: st.code,
        name: st.name,
        durationMinutes: st.durationMinutes,
        availableSlots: [],
      });
    }

    const aggregatedSlotTimes = new Set<string>();

    for (const st of serviceTypes) {
      const candidateSlots = this.slotPolicy.generate({
        settings,
        durationMinutes: st.durationMinutes,
        date,
        now: this.clock.now(),
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

      const serviceSummary = serviceTypesMap.get(st.id)!;

      for (const slot of activeSlots) {
        const slotKey = slot.startAt.toISOString();
        const cap = capacityMap.get(slotKey) ?? { remainingCapacity: 0, totalCapacity: 0 };
        const techs = techMap.get(slotKey) ?? [];

        if (cap.remainingCapacity > 0) {
          aggregatedSlotTimes.add(slotKey);
          serviceSummary.availableSlots.push({
            startAt: slot.startAt.toISOString(),
            endAt: slot.endAt.toISOString(),
            remainingCapacity: cap.remainingCapacity,
            totalCapacity: cap.totalCapacity,
            availableTechnicians: techs.map((t) => ({ id: t.id, name: t.name })),
          });
        }
      }
    }

    const aggregatedSlots: AggregatedSlotDto[] = Array.from(aggregatedSlotTimes)
      .sort()
      .map((startIso) => {
        const startAt = new Date(startIso);
        const endAt = new Date(startAt.getTime() + settings.slotMinutes * 60_000);
        const freeTechs = baseSlotTechMap.get(startIso) ?? [];

        const servicesAvailableAtSlot = Array.from(serviceTypesMap.values())
          .filter((st) => st.availableSlots.some((s) => s.startAt === startIso))
          .map((st) => ({
            id: st.id,
            name: st.name,
            durationMinutes: st.durationMinutes,
          }));

        return {
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          availableServicesCount: servicesAvailableAtSlot.length,
          availableServices: servicesAvailableAtSlot,
          availableTechnicians: freeTechs.map((t) => ({ id: t.id, name: t.name })),
        };
      });

    return {
      dealership: {
        id: dealershipId,
        name: dealershipName,
        timezone: dealershipTimezone,
      },
      date,
      slotMinutes: settings.slotMinutes,
      operatingHours: {
        openTime: settings.openTime,
        closeTime: settings.closeTime,
      },
      aggregatedSlots,
      serviceTypes: Array.from(serviceTypesMap.values()),
    };
  }

  /**
   * Retrieves specific available technicians for a service slot.
   */
  public async getSlotTechnicians(
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
        'Invalid startAt timestamp format (expected ISO 8601 string, e.g. 2026-11-01T08:00:00.000Z)',
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
