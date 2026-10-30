import { Injectable } from '@nestjs/common';
import { DateTime, IANAZone } from 'luxon';
import { DomainException, ErrorCode } from '@app/common';
import {
  BaseDailySlot,
  CandidateSlot,
  GenerateBaseDailySlotsParams,
  GenerateSlotsParams,
} from './slot-policy.types';

export { BaseDailySlot, CandidateSlot, GenerateBaseDailySlotsParams, GenerateSlotsParams };

/**
 * Exception thrown when the workshop operational settings in the database contain invalid or corrupt values.
 */
export class InvalidWorkshopSettingsException extends DomainException {
  public constructor(message: string) {
    super(ErrorCode.INTERNAL_ERROR, message, null, 500);
  }
}

/**
 * =========================================================================================
 * SlotPolicy — Single Source of Truth for Workshop Slot Grid & Time Boundary Calculation
 * =========================================================================================
 *
 * DESIGN INTENT & ARCHITECTURAL PURPOSE:
 * 1. Single Source of Truth:
 *    - Serves as the sole authoritative domain policy for candidate slot generation.
 *    - Shared symmetrically between `ResourceAvailabilityService` (query screen for customers)
 *      and `CreateAppointmentUseCase` (booking mutation validation), guaranteeing zero logic drift.
 * 2. Strict Timezone Alignment (IANA Timezone):
 *    - Evaluates operating hours (`opensAt`, `closesAt`) within the dealership's local timezone
 *      (e.g., 'Asia/Ho_Chi_Minh', UTC+7) using Luxon to prevent UTC offset day-shift bugs.
 * 3. Bounded Iteration & Infinite Loop Prevention:
 *    - Employs a deterministic `for` loop with strictly positive `slotMinutes` increments and
 *      the termination condition `occupiedUntil <= closeTime`.
 * 4. Business Constraint Enforcement:
 *    - Past date rejection (`date < today`).
 *    - Horizon cutoff enforcement (`date <= today + horizonDays`).
 *    - Minimum advance notice check (`startAt >= now + leadTimeMinutes`).
 */
@Injectable()
export class SlotPolicy {
  /**
   * Generates all candidate slot intervals for a specified calendar date and service duration.
   *
   * @param params Parameter bag containing settings, service duration, target date, and current time.
   * @returns Array of CandidateSlot instances with exact UTC timestamps and advance notice flags.
   * @throws InvalidWorkshopSettingsException If settings are corrupt (invalid IANA timezone, closesAt <= opensAt, slotMinutes <= 0).
   * @throws DomainException (400 VALIDATION_FAILED) If date format is invalid, in the past, or exceeds horizonDays.
   */
  public generate(params: GenerateSlotsParams): CandidateSlot[] {
    const { settings, durationMinutes, date, now } = params;
    const timeZone = settings.timezone;

    // 1. Validate Workshop Operational Settings
    if (!IANAZone.isValidZone(timeZone)) {
      throw new InvalidWorkshopSettingsException(`Invalid IANA timezone configured: '${timeZone}'`);
    }
    if (settings.slotMinutes <= 0 || durationMinutes <= 0) {
      throw new InvalidWorkshopSettingsException(
        `slotMinutes (${settings.slotMinutes}) and durationMinutes (${durationMinutes}) must be positive integers greater than 0`,
      );
    }
    if (settings.closesAt <= settings.opensAt) {
      throw new InvalidWorkshopSettingsException(
        `Workshop closing time '${settings.closesAt}' must be after opening time '${settings.opensAt}'`,
      );
    }

    // 2. Validate Target Date in Dealership Local Timezone
    const targetDay = DateTime.fromISO(date, { zone: timeZone });
    if (!targetDay.isValid) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Invalid date format: '${date}' (expected format: YYYY-MM-DD, e.g. 2026-11-01)`,
        null,
        400,
      );
    }

    // Reference today's beginning of day (00:00:00.000) in the workshop's local timezone
    const todayStart = DateTime.fromJSDate(now, { zone: timeZone }).startOf('day');
    if (targetDay < todayStart) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Cannot query availability or book appointments for past dates',
        null,
        400,
      );
    }

    // Booking Horizon Constraint (horizonDays): Maximum allowable advance booking window
    const maxHorizonDay = todayStart.plus({ days: settings.horizonDays });
    if (targetDay > maxHorizonDay) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Requested booking date '${date}' exceeds the maximum allowed horizon (${settings.horizonDays} days from today)`,
        null,
        400,
      );
    }

    // 3. Resolve Opening and Closing Boundary Timestamps in Local Timezone
    const openTime = DateTime.fromISO(`${date}T${settings.opensAt}`, { zone: timeZone });
    const closeTime = DateTime.fromISO(`${date}T${settings.closesAt}`, { zone: timeZone });

    if (!openTime.isValid || !closeTime.isValid || closeTime <= openTime) {
      throw new InvalidWorkshopSettingsException(
        `Workshop closing time '${settings.closesAt}' must be after opening time '${settings.opensAt}'`,
      );
    }

    // 4. Calculate Total Occupancy Window & Earliest Permissible Advance Notice Threshold
    const totalOccupiedMinutes = durationMinutes + settings.bufferMinutes;
    const earliestBookableEpochMs = now.getTime() + settings.leadTimeMinutes * 60_000;

    const candidateSlots: CandidateSlot[] = [];

    // 5. Grid Traversal: Step from openTime by slotMinutes intervals
    for (
      let currentSlotPointer = openTime;
      currentSlotPointer.plus({ minutes: totalOccupiedMinutes }) <= closeTime;
      currentSlotPointer = currentSlotPointer.plus({ minutes: settings.slotMinutes })
    ) {
      const slotStartAt = currentSlotPointer.toJSDate();
      const slotEndAt = currentSlotPointer.plus({ minutes: durationMinutes }).toJSDate();
      const slotOccupiedUntil = currentSlotPointer.plus({ minutes: totalOccupiedMinutes }).toJSDate();

      const isLeadTimeSatisfied = slotStartAt.getTime() >= earliestBookableEpochMs;

      candidateSlots.push({
        startAt: slotStartAt,
        endAt: slotEndAt,
        occupiedUntil: slotOccupiedUntil,
        meetsLeadTime: isLeadTimeSatisfied,
      });
    }

    return candidateSlots;
  }

  /**
   * Generates the baseline daily operational slot grid for a dealership on a given calendar date.
   * Returns slots stepped by `slotMinutes` between `opensAt` and `closesAt` with localized display times.
   *
   * @param params Parameter bag containing settings, target date, and current system clock.
   * @returns Array of base slot objects containing startAt Date, displayTime (HH:mm), and meetsLeadTime flag.
   */
  public generateBaseDailySlots(params: GenerateBaseDailySlotsParams): BaseDailySlot[] {
    const { settings, date, now } = params;
    const timeZone = settings.timezone;

    if (!IANAZone.isValidZone(timeZone)) {
      throw new InvalidWorkshopSettingsException(`Invalid IANA timezone configured: '${timeZone}'`);
    }

    const targetDay = DateTime.fromISO(date, { zone: timeZone });
    if (!targetDay.isValid) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Invalid date format: '${date}' (expected format: YYYY-MM-DD, e.g. 2026-11-01)`,
        null,
        400,
      );
    }

    const todayStart = DateTime.fromJSDate(now, { zone: timeZone }).startOf('day');
    if (targetDay < todayStart) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Cannot query availability or book appointments for past dates',
        null,
        400,
      );
    }

    const maxHorizonDay = todayStart.plus({ days: settings.horizonDays });
    if (targetDay > maxHorizonDay) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Requested booking date '${date}' exceeds the maximum allowed horizon (${settings.horizonDays} days from today)`,
        null,
        400,
      );
    }

    const openTime = DateTime.fromISO(`${date}T${settings.opensAt}`, { zone: timeZone });
    const closeTime = DateTime.fromISO(`${date}T${settings.closesAt}`, { zone: timeZone });

    if (!openTime.isValid || !closeTime.isValid || closeTime <= openTime) {
      throw new InvalidWorkshopSettingsException(
        `Workshop closing time '${settings.closesAt}' must be after opening time '${settings.opensAt}'`,
      );
    }

    const earliestBookableEpochMs = now.getTime() + settings.leadTimeMinutes * 60_000;
    const slots: BaseDailySlot[] = [];

    for (
      let ptr = openTime;
      ptr < closeTime;
      ptr = ptr.plus({ minutes: settings.slotMinutes })
    ) {
      const slotDate = ptr.toJSDate();
      slots.push({
        startAt: slotDate,
        displayTime: ptr.toFormat('HH:mm'),
        meetsLeadTime: slotDate.getTime() >= earliestBookableEpochMs,
      });
    }

    return slots;
  }
}
