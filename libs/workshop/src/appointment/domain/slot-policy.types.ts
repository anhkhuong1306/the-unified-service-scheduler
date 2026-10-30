import { WorkshopSettings } from '../../settings/workshop-settings.entity';

/**
 * Structure representing a candidate time slot on the workshop's operational slot grid.
 */
export interface CandidateSlot {
  /**
   * Service start timestamp in UTC.
   * Vehicle is admitted into the assigned service bay and technician starts work.
   *
   * @format ISO 8601 UTC timestamp
   * @example '2026-11-01T01:00:00.000Z' (which equals 08:00:00 in 'Asia/Ho_Chi_Minh' UTC+7)
   */
  readonly startAt: Date;

  /**
   * Estimated service completion timestamp in UTC.
   * Computed as: startAt + durationMinutes.
   *
   * @format ISO 8601 UTC timestamp
   * @example '2026-11-01T01:45:00.000Z' (for a 45-minute oil & filter service starting at 01:00:00Z)
   */
  readonly endAt: Date;

  /**
   * Resource turnover release timestamp in UTC.
   * Service bay and technician are fully released after cleaning, sanitization, and bay reset.
   * Computed as: endAt + bufferMinutes.
   * The range [startAt, occupiedUntil) is strictly protected against double-booking by GiST Exclusion Constraints.
   *
   * @format ISO 8601 UTC timestamp
   * @example '2026-11-01T02:00:00.000Z' (with 15 minutes turnover buffer: 01:45Z + 15m = 02:00Z)
   */
  readonly occupiedUntil: Date;

  /**
   * Boolean flag indicating whether the slot satisfies the workshop's minimum advance notice requirement.
   * - `true`: startAt >= now + leadTimeMinutes (dealership staff has sufficient preparation time).
   * - `false`: too close to the current moment to accept new bookings.
   *
   * @example true
   */
  readonly meetsLeadTime: boolean;
}

/**
 * Input parameters required to generate candidate slot intervals for a service type.
 */
export interface GenerateSlotsParams {
  /** Operational configuration of the dealership (hours, timezone, slot/buffer/lead time/horizon) */
  readonly settings: WorkshopSettings;

  /**
   * Technical duration of the chosen service package in integer minutes.
   * @format Integer minutes > 0
   * @example 45 (45 minutes for standard oil change), 75 (75 minutes for brake overhaul)
   */
  readonly durationMinutes: number;

  /**
   * Target booking date in local calendar format.
   * @format YYYY-MM-DD
   * @example '2026-11-01'
   */
  readonly date: string;

  /** System clock reference timestamp at execution time */
  readonly now: Date;
}

/**
 * Input parameters required to generate baseline daily operational slots.
 */
export interface GenerateBaseDailySlotsParams {
  /** Operational configuration of the dealership (hours, timezone, slot/buffer/lead time/horizon) */
  readonly settings: WorkshopSettings;

  /**
   * Target booking date in local calendar format.
   * @format YYYY-MM-DD
   * @example '2026-11-01'
   */
  readonly date: string;

  /** System clock reference timestamp at execution time */
  readonly now: Date;
}

/**
 * Base daily slot output structure.
 */
export interface BaseDailySlot {
  readonly startAt: Date;
  readonly displayTime: string;
  readonly meetsLeadTime: boolean;
}
