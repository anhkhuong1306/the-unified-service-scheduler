import { DomainException, ErrorCode } from '@app/common';

export interface Slot {
  readonly startAt: Date;
  readonly endAt: Date;
  readonly occupiedUntil: Date;
}

export function calculateSlot(
  startAtRaw: string,
  durationMin: number,
  bufferMin: number,
  now: Date,
): Slot {
  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) {
    throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Invalid startAt date format', null, 400);
  }
  if (startAt <= now) {
    throw new DomainException(ErrorCode.VALIDATION_FAILED, 'startAt must be in the future', null, 400);
  }

  const endAt = new Date(startAt.getTime() + durationMin * 60_000);
  const occupiedUntil = new Date(endAt.getTime() + bufferMin * 60_000);

  return { startAt, endAt, occupiedUntil };
}
