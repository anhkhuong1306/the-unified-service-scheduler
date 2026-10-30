import { SlotPolicy, InvalidWorkshopSettingsException } from '../slot-policy';
import { WorkshopSettings } from '../../../settings/workshop-settings.entity';
import { DomainException } from '@app/common';

describe('SlotPolicy (Unit - Section G7)', () => {
  let policy: SlotPolicy;

  beforeEach(() => {
    policy = new SlotPolicy();
  });

  const createBaseSettings = (override?: Partial<WorkshopSettings>): WorkshopSettings => {
    return {
      dealershipId: '1',
      tenantId: '1',
      timezone: 'Asia/Ho_Chi_Minh',
      opensAt: '08:00:00',
      closesAt: '18:00:00',
      slotMinutes: 30,
      bufferMinutes: 15,
      graceMinutes: 15,
      leadTimeMinutes: 60,
      horizonDays: 30,
      cancellationCutoffMinutes: 120,
      requiresApproval: false,
      maxActivePerCustomer: 3,
      ...override,
    } as WorkshopSettings;
  };

  it('should throw InvalidWorkshopSettingsException when timezone is invalid or slotMinutes is non-positive', () => {
    const invalidTzSettings = createBaseSettings({ timezone: 'Invalid/NonExistentZone' });
    expect(() =>
      policy.generate({
        settings: invalidTzSettings,
        durationMinutes: 45,
        date: '2030-01-01',
        now: new Date('2029-12-01T00:00:00.000Z'),
      }),
    ).toThrow(InvalidWorkshopSettingsException);

    const invalidSlotSettings = createBaseSettings({ slotMinutes: 0 });
    expect(() =>
      policy.generate({
        settings: invalidSlotSettings,
        durationMinutes: 45,
        date: '2030-01-01',
        now: new Date('2029-12-01T00:00:00.000Z'),
      }),
    ).toThrow(InvalidWorkshopSettingsException);
  });

  it('should throw InvalidWorkshopSettingsException when closesAt is earlier than opensAt', () => {
    const invertedHoursSettings = createBaseSettings({
      opensAt: '18:00:00',
      closesAt: '08:00:00',
    });
    expect(() =>
      policy.generate({
        settings: invertedHoursSettings,
        durationMinutes: 45,
        date: '2030-01-01',
        now: new Date('2029-12-01T00:00:00.000Z'),
      }),
    ).toThrow(InvalidWorkshopSettingsException);
  });

  it('should throw 400 DomainException for past dates or dates exceeding horizonDays', () => {
    const settings = createBaseSettings({ horizonDays: 14 });
    const fixedNow = new Date('2030-01-10T00:00:00.000Z');

    // Past date
    expect(() =>
      policy.generate({
        settings,
        durationMinutes: 45,
        date: '2030-01-05',
        now: fixedNow,
      }),
    ).toThrow(DomainException);

    // Date exceeding 14 days horizon
    expect(() =>
      policy.generate({
        settings,
        durationMinutes: 45,
        date: '2030-01-26',
        now: fixedNow,
      }),
    ).toThrow(DomainException);
  });

  it('should correctly convert Asia/Ho_Chi_Minh 08:00 to 01:00 UTC and ensure last slot occupiedUntil <= closesAt', () => {
    const settings = createBaseSettings({
      timezone: 'Asia/Ho_Chi_Minh',
      opensAt: '08:00:00',
      closesAt: '12:00:00', // 4 hours = 08:00 to 12:00 local (01:00 UTC to 05:00 UTC)
      slotMinutes: 30,
      bufferMinutes: 15,
      leadTimeMinutes: 0,
    });

    const fixedNow = new Date('2030-01-01T00:00:00.000Z');
    const slots = policy.generate({
      settings,
      durationMinutes: 45, // occupied = 45 + 15 = 60m
      date: '2030-01-01',
      now: fixedNow,
    });

    expect(slots.length).toBeGreaterThan(0);

    // Asia/Ho_Chi_Minh is UTC+7. 08:00 local is 01:00 UTC.
    expect(slots[0].startAt.toISOString()).toBe('2030-01-01T01:00:00.000Z');
    expect(slots[0].endAt.toISOString()).toBe('2030-01-01T01:45:00.000Z');
    expect(slots[0].occupiedUntil.toISOString()).toBe('2030-01-01T02:00:00.000Z');

    // Last slot must not exceed 12:00 local (05:00 UTC)
    const lastSlot = slots[slots.length - 1];
    expect(lastSlot.occupiedUntil.getTime()).toBeLessThanOrEqual(
      new Date('2030-01-01T05:00:00.000Z').getTime(),
    );
  });

  it('should flag meetsLeadTime = false for slots within leadTimeMinutes', () => {
    const settings = createBaseSettings({
      timezone: 'Asia/Ho_Chi_Minh',
      opensAt: '08:00:00',
      closesAt: '12:00:00',
      slotMinutes: 30,
      bufferMinutes: 15,
      leadTimeMinutes: 60, // 1 hour lead time
    });

    // now is 08:15 local (01:15 UTC).
    // Earliest slot meeting lead time is 01:15 + 60m = 02:15 UTC (09:15 local).
    const fixedNow = new Date('2030-01-01T01:15:00.000Z');

    const slots = policy.generate({
      settings,
      durationMinutes: 45,
      date: '2030-01-01',
      now: fixedNow,
    });

    // Slot 0 (01:00 UTC / 08:00 local): meetsLeadTime is false
    expect(slots[0].meetsLeadTime).toBe(false);
    // Slot 1 (01:30 UTC / 08:30 local): 01:30 < 02:15 -> false
    expect(slots[1].meetsLeadTime).toBe(false);
    // Slot 2 (02:00 UTC / 09:00 local): 02:00 < 02:15 -> false
    expect(slots[2].meetsLeadTime).toBe(false);
    // Slot 3 (02:30 UTC / 09:30 local): 02:30 >= 02:15 -> true
    expect(slots[3].meetsLeadTime).toBe(true);
  });
});
