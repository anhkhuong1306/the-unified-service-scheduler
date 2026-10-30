/**
 * Detailed representation of a qualified technician available for customer booking in a given slot.
 */
export interface AvailableTechnicianDto {
  /**
   * Technician unique primary identifier (bigint string).
   * @example '1'
   */
  readonly id: string;

  /**
   * Full display name of the technician.
   * @example 'Technician 01'
   */
  readonly name: string;

  /**
   * Array of technical skill IDs possessed by this technician.
   * @example ['1', '2']
   */
  readonly skillIds: string[];
}

/**
 * Detailed availability breakdown for a single candidate slot interval.
 */
export interface SlotAvailabilityDto {
  /**
   * Service start timestamp in UTC.
   * @format ISO 8601 UTC timestamp string
   * @example '2026-11-01T01:00:00.000Z' (which equals 08:00:00 local time in GMT+7)
   */
  readonly startAt: string;

  /**
   * Estimated service completion timestamp in UTC.
   * @format ISO 8601 UTC timestamp string
   * @example '2026-11-01T01:45:00.000Z' (for a 45-minute technical service)
   */
  readonly endAt: string;

  /**
   * Resource release timestamp after turnaround buffer in UTC.
   * @format ISO 8601 UTC timestamp string
   * @example '2026-11-01T02:00:00.000Z' (endAt + 15m turnover buffer)
   */
  readonly occupiedUntil: string;

  /**
   * Number of service bays fully vacant and operational across the whole [startAt, occupiedUntil) window.
   * @example 8
   */
  readonly freeBays: number;

  /**
   * Number of qualified technicians holding the required service skill and free across the whole [startAt, occupiedUntil) window.
   * @example 4
   */
  readonly freeTechnicians: number;

  /**
   * Actual net appointment booking capacity for this slot: `Math.min(freeBays, freeTechnicians)`.
   * An appointment requires both a vacant bay AND a qualified technician simultaneously.
   * @example 4
   */
  readonly remainingCapacity: number;

  /**
   * Indicates whether the slot can be booked by a customer right now:
   * Requires `meetsLeadTime === true` AND `remainingCapacity > 0`.
   * @example true
   */
  readonly isAvailable: boolean;

  /**
   * Array of qualified technicians free across this entire slot interval,
   * enabling the customer to optionally select a preferred technician.
   */
  readonly availableTechnicians: AvailableTechnicianDto[];
}

/**
 * Response payload returning the complete day grid availability for a given service at a dealership.
 */
export interface AvailabilityResponseDto {
  /** Dealership primary identifier (bigint string) */
  readonly dealershipId: string;

  /** Service type primary identifier (bigint string) */
  readonly serviceTypeId: string;

  /**
   * Query date in calendar format.
   * @format YYYY-MM-DD
   * @example '2026-11-01'
   */
  readonly date: string;

  /**
   * Workshop slot grid resolution in minutes.
   * @format Integer minutes > 0
   * @example 30
   */
  readonly slotMinutes: number;

  /**
   * Service technical duration in minutes.
   * @format Integer minutes > 0
   * @example 45
   */
  readonly durationMinutes: number;

  /**
   * Workshop turnaround and cleaning buffer in minutes.
   * @format Integer minutes >= 0
   * @example 15
   */
  readonly bufferMinutes: number;

  /** Array of all candidate slots spanning the workshop's daily operating window */
  readonly slots: SlotAvailabilityDto[];
}

/**
 * Service type bookable within a specific slot.
 */
export interface AvailableServiceTypeSummaryDto {
  /** Service type primary identifier (bigint string) */
  readonly serviceTypeId: string;

  /** Service type code (e.g. 'OIL_FILTER') */
  readonly code: string;

  /** Human-readable service name (e.g. 'Standard Oil & Filter Service') */
  readonly name: string;

  /** Technical duration in minutes */
  readonly durationMinutes: number;

  /**
   * Service completion timestamp in UTC.
   * @format ISO 8601 UTC timestamp string
   * @example '2026-11-01T01:45:00.000Z'
   */
  readonly endAt: string;

  /**
   * Resource turnaround release timestamp in UTC.
   * @format ISO 8601 UTC timestamp string
   * @example '2026-11-01T02:00:00.000Z'
   */
  readonly occupiedUntil: string;

  /**
   * Net remaining booking capacity for this service in this slot: Math.min(freeBays, freeQualifiedTechnicians).
   * @example 3
   */
  readonly remainingCapacity: number;

  /**
   * Qualified technicians holding required skill and free across the whole [startAt, occupiedUntil) window.
   */
  readonly availableTechnicians: AvailableTechnicianDto[];
}

/**
 * Aggregated slot representation combining start time, display time, available technicians,
 * and all bookable service types for customer calendar selection.
 */
export interface AggregatedSlotDto {
  /**
   * Slot start timestamp in UTC.
   * @format ISO 8601 UTC timestamp string
   * @example '2026-11-01T01:00:00.000Z'
   */
  readonly startAt: string;

  /**
   * Localized clock time formatted for customer display.
   * @format HH:mm in dealership timezone
   * @example '08:00'
   */
  readonly displayTime: string;

  /**
   * Indicates whether this slot satisfies the minimum advance notice requirement.
   * @example true
   */
  readonly meetsLeadTime: boolean;

  /**
   * Qualified and free technicians available at this slot start time,
   * enabling customer technician selection on the booking interface.
   */
  readonly availableTechnicians: AvailableTechnicianDto[];

  /**
   * All service packages that can be performed starting at this slot with their respective capacities.
   */
  readonly availableServiceTypes: AvailableServiceTypeSummaryDto[];
}

/**
 * Customer-facing response payload for the dealership slot booking screen.
 * Contains the daily grid of slots with available technicians alongside startAt and bookable service types.
 */
export interface DealershipAvailableSlotsResponseDto {
  /** Dealership primary identifier (bigint string) */
  readonly dealershipId: string;

  /** Dealership commercial display name */
  readonly dealershipName: string;

  /**
   * Query date in calendar format.
   * @format YYYY-MM-DD
   * @example '2026-11-01'
   */
  readonly date: string;

  /** Dealership operational timezone */
  readonly timezone: string;

  /** Workshop slot grid resolution in minutes */
  readonly slotMinutes: number;

  /** Complete chronological array of time slots spanning the operational day */
  readonly slots: AggregatedSlotDto[];
}

/**
 * Response payload for querying qualified free technicians for a specific single slot.
 */
export interface SlotTechniciansResponseDto {
  readonly dealershipId: string;
  readonly serviceTypeId: string;
  readonly startAt: string;
  readonly occupiedUntil: string;
  readonly technicians: AvailableTechnicianDto[];
}
