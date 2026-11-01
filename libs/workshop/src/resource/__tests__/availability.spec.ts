import { ResourceAvailabilityService } from '../services/resource-availability.service';
import { SlotPolicy } from '../../appointment/domain/slot-policy';
import { WorkshopSettings } from '../../settings/entities/workshop-settings.entity';
import { ServiceType } from '../../service-catalog/entities/service-type.entity';

describe('ResourceAvailabilityService (Unit - Section G & Customer Technician Selection)', () => {
  let service: ResourceAvailabilityService;
  let mockSettingsRepo: { findByDealershipId: jest.Mock };
  let mockServiceTypeRepo: { findById: jest.Mock; findAll: jest.Mock };
  let mockAvailabilityRepo: {
    countFreePerSlot: jest.Mock;
    findFreeTechniciansPerSlot: jest.Mock;
    findFreeTechniciansForWindow: jest.Mock;
  };
  let mockClock: { now: jest.Mock };
  let slotPolicy: SlotPolicy;

  beforeEach(() => {
    mockSettingsRepo = {
      findByDealershipId: jest.fn(),
    };
    mockServiceTypeRepo = {
      findById: jest.fn(),
      findAll: jest.fn(),
    };
    mockAvailabilityRepo = {
      countFreePerSlot: jest.fn(),
      findFreeTechniciansPerSlot: jest.fn(),
      findFreeTechniciansForWindow: jest.fn(),
    };
    mockClock = {
      now: jest.fn().mockReturnValue(new Date('2030-01-01T00:00:00.000Z')),
    };
    const mockOrgDirectory = {
      findDealershipById: jest.fn().mockResolvedValue({ name: 'Central Dealership' }),
    };
    slotPolicy = new SlotPolicy();

    service = new ResourceAvailabilityService(
      {} as any, // dataSource
      mockSettingsRepo as any,
      mockServiceTypeRepo as any,
      slotPolicy,
      mockAvailabilityRepo as any,
      mockClock as any,
      mockOrgDirectory as any,
    );
  });

  it('should query capacity and available technicians in batch and assemble response correctly', async () => {
    const fakeSettings = {
      dealershipId: '1',
      tenantId: '1',
      slotMinutes: 60,
      bufferMinutes: 0,
      leadTimeHours: 1,
      openTime: '08:00',
      closeTime: '17:00',
      timezone: 'UTC',
      operatingHours: [{ dayOfWeek: 1, openTime: '08:00', closeTime: '17:00' }],
    } as unknown as WorkshopSettings;

    const fakeServiceType = {
      id: '1',
      name: 'Standard Oil Change',
      durationMinutes: 60,
      skillId: '10',
    } as unknown as ServiceType;

    mockSettingsRepo.findByDealershipId.mockResolvedValue(fakeSettings);
    mockServiceTypeRepo.findById.mockResolvedValue(fakeServiceType);

    mockAvailabilityRepo.countFreePerSlot.mockResolvedValue(
      new Map([
        ['2030-01-01T08:00:00.000Z', { remainingCapacity: 2, totalCapacity: 3 }],
        ['2030-01-01T09:00:00.000Z', { remainingCapacity: 0, totalCapacity: 3 }],
      ]),
    );

    mockAvailabilityRepo.findFreeTechniciansPerSlot.mockResolvedValue(
      new Map([
        [
          '2030-01-01T08:00:00.000Z',
          [
            { id: '101', name: 'Nguyen Van A' },
            { id: '102', name: 'Tran Van B' },
          ],
        ],
        ['2030-01-01T09:00:00.000Z', []],
      ]),
    );

    const res = await service.getAvailability('1', '1', '1', '2030-01-01');

    expect(res.dealershipId).toBe('1');
    expect(res.serviceTypeId).toBe('1');
    expect(res.date).toBe('2030-01-01');
    expect(res.slots.length).toBeGreaterThan(0);

    const slot0800 = res.slots.find((s) => s.startAt === '2030-01-01T08:00:00.000Z');
    expect(slot0800).toBeDefined();
    expect(slot0800?.status).toBe('AVAILABLE');
    expect(slot0800?.remainingCapacity).toBe(2);
    expect(slot0800?.totalCapacity).toBe(3);
    expect(slot0800?.availableTechnicians).toEqual([
      { id: '101', name: 'Nguyen Van A' },
      { id: '102', name: 'Tran Van B' },
    ]);

    const slot0900 = res.slots.find((s) => s.startAt === '2030-01-01T09:00:00.000Z');
    expect(slot0900).toBeDefined();
    expect(slot0900?.status).toBe('UNAVAILABLE');
    expect(slot0900?.remainingCapacity).toBe(0);
    expect(slot0900?.availableTechnicians).toEqual([]);
  });

  it('should support dealership aggregate available slots query', async () => {
    const fakeSettings = {
      dealershipId: '1',
      tenantId: '1',
      slotMinutes: 60,
      bufferMinutes: 0,
      leadTimeHours: 1,
      openTime: '08:00',
      closeTime: '17:00',
      timezone: 'UTC',
      operatingHours: [{ dayOfWeek: 1, openTime: '08:00', closeTime: '17:00' }],
    } as unknown as WorkshopSettings;

    const fakeServiceTypes = [
      {
        id: '1',
        code: 'OIL',
        name: 'Oil Change',
        durationMinutes: 60,
        skillId: '10',
      },
    ] as unknown as ServiceType[];

    mockSettingsRepo.findByDealershipId.mockResolvedValue(fakeSettings);
    mockServiceTypeRepo.findAll.mockResolvedValue(fakeServiceTypes);

    mockAvailabilityRepo.countFreePerSlot.mockResolvedValue(
      new Map([['2030-01-01T08:00:00.000Z', { remainingCapacity: 2, totalCapacity: 3 }]]),
    );

    mockAvailabilityRepo.findFreeTechniciansPerSlot.mockResolvedValue(
      new Map([
        [
          '2030-01-01T08:00:00.000Z',
          [{ id: '101', name: 'Nguyen Van A' }],
        ],
      ]),
    );

    const res = await service.getDealershipAvailableSlots('1', '1', '2030-01-01');

    expect(res.dealership.id).toBe('1');
    expect(res.date).toBe('2030-01-01');
    expect(res.aggregatedSlots.length).toBeGreaterThan(0);
    expect(res.serviceTypes.length).toBe(1);
    expect(res.serviceTypes[0].availableSlots.length).toBeGreaterThan(0);
  });

  it('should support getSlotTechnicians query for preferred technician selection', async () => {
    const fakeSettings = {
      dealershipId: '1',
      tenantId: '1',
      slotMinutes: 60,
      bufferMinutes: 10,
      timezone: 'UTC',
    } as unknown as WorkshopSettings;

    const fakeServiceType = {
      id: '1',
      name: 'Brake Service',
      durationMinutes: 60,
      skillId: '20',
    } as unknown as ServiceType;

    mockSettingsRepo.findByDealershipId.mockResolvedValue(fakeSettings);
    mockServiceTypeRepo.findById.mockResolvedValue(fakeServiceType);

    mockAvailabilityRepo.findFreeTechniciansForWindow.mockResolvedValue([
      { id: '101', name: 'Nguyen Van A' },
      { id: '103', name: 'Le Van C' },
    ]);

    const res = await service.getSlotTechnicians(
      '1',
      '1',
      '1',
      '2030-01-01T08:00:00.000Z',
    );

    expect(res.dealershipId).toBe('1');
    expect(res.serviceTypeId).toBe('1');
    expect(res.technicians).toHaveLength(2);
    expect(res.technicians[0].id).toBe('101');
  });
});
