import { AppointmentStatus } from './appointment-status.enum';

export const ACTIVE_STATUSES = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
] as const;

export type ActiveAppointmentStatus = typeof ACTIVE_STATUSES[number];
