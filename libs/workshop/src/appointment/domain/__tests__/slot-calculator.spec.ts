import { calculateSlot } from '../slot-calculator';
import { DomainException } from '@app/common';

describe('calculateSlot (Unit)', () => {
  const fixedNow = new Date('2030-01-01T08:00:00.000Z');

  it('should accurately calculate endAt and occupiedUntil with buffer', () => {
    const startAtRaw = '2030-01-01T09:00:00.000Z';
    const durationMin = 45;
    const bufferMin = 15;

    const slot = calculateSlot(startAtRaw, durationMin, bufferMin, fixedNow);

    expect(slot.startAt.toISOString()).toBe('2030-01-01T09:00:00.000Z');
    expect(slot.endAt.toISOString()).toBe('2030-01-01T09:45:00.000Z');
    expect(slot.occupiedUntil.toISOString()).toBe('2030-01-01T10:00:00.000Z');
  });

  it('should throw DomainException (400) if startAt date string is invalid', () => {
    expect(() =>
      calculateSlot('not-a-valid-date', 45, 15, fixedNow),
    ).toThrow(DomainException);
  });

  it('should throw DomainException (400) if startAt is in the past', () => {
    const pastDate = '2029-12-31T23:59:59.000Z';
    expect(() =>
      calculateSlot(pastDate, 45, 15, fixedNow),
    ).toThrow(DomainException);
  });
});
