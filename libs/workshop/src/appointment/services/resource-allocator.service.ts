import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  SlotUnavailableException,
  TechnicianUnavailableException,
} from '@app/common';
import { AppointmentAvailabilityRepository } from '../repositories/appointment-availability.repository';
import { AllocationParams, AllocatedResources } from './resource-allocator.types';

export { AllocationParams, AllocatedResources };

@Injectable()
export class ResourceAllocator {
  public constructor(
    private readonly availability: AppointmentAvailabilityRepository,
  ) {}

  public async allocate(
    m: EntityManager,
    p: AllocationParams,
  ): Promise<AllocatedResources> {
    const { startAt, occupiedUntil } = p.slot;

    const bayId = await this.availability.findFreeBayId(
      m,
      p.dealershipId,
      startAt,
      occupiedUntil,
    );
    if (!bayId) {
      throw SlotUnavailableException.withAlternatives(
        'NO_FREE_BAY',
        [],
        'No service bay available for the requested time slot',
      );
    }

    const technicianId = await this.availability.findFreeTechnicianId(m, {
      dealershipId: p.dealershipId,
      skillId: p.skillId,
      requestedId: p.requestedTechnicianId,
      from: startAt,
      to: occupiedUntil,
    });

    if (!technicianId) {
      if (p.requestedTechnicianId) {
        throw new TechnicianUnavailableException(
          `Technician ${p.requestedTechnicianId} is unavailable or unqualified for this service`,
        );
      }
      throw SlotUnavailableException.withAlternatives(
        'NO_QUALIFIED_TECHNICIAN',
        [],
        'No qualified technician available for the requested time slot',
      );
    }

    return { bayId, technicianId };
  }
}
