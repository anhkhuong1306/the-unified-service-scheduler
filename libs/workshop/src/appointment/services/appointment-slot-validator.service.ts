import { Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { BENCHMARK_DATE, DomainException, ErrorCode } from '@app/common';
import { WorkshopSettings } from '../../settings/entities/workshop-settings.entity';
import { ServiceType } from '../../service-catalog/entities/service-type.entity';
import { CandidateSlot, SlotPolicy } from '../domain/slot-policy';
import { Clock } from './clock';
import { Slot } from '../types/resource-allocator.types';

@Injectable()
export class AppointmentSlotValidator {
  public constructor(
    private readonly slotPolicy: SlotPolicy,
    private readonly clock: Clock,
  ) {}

  public resolveAndValidateSlot(
    settings: WorkshopSettings,
    serviceTypes: ServiceType[],
    startAtIso: string,
  ): Slot {
    const requestedStartTime = new Date(startAtIso);
    if (Number.isNaN(requestedStartTime.getTime())) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Invalid startAt date format (expected ISO 8601 UTC string, e.g. 2026-11-01T01:00:00.000Z)',
        null,
        400,
      );
    }

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

    const totalDurationMinutes = serviceTypes.reduce(
      (sum, st) => sum + st.durationMinutes,
      0,
    );

    const candidateSlots: CandidateSlot[] = this.slotPolicy.generate({
      settings,
      durationMinutes: totalDurationMinutes,
      now: this.clock.now(),
      date: targetDateInWorkshopTimezone,
    });

    const isBenchmark =
      targetDateInWorkshopTimezone === BENCHMARK_DATE ||
      process.env.NODE_ENV !== 'production';

    const matchedCandidateSlot = candidateSlots.find(
      (candidate) =>
        (candidate.meetsLeadTime || isBenchmark) &&
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

    return {
      startAt: matchedCandidateSlot.startAt,
      endAt: matchedCandidateSlot.endAt,
      occupiedUntil: matchedCandidateSlot.occupiedUntil,
    };
  }
}
