import { ResourceAvailabilityService } from '../resource-availability.service';
import { SlotPolicy } from '../../appointment/domain/slot-policy';
import { WorkshopSettings } from '../../settings/workshop-settings.entity';
import { ServiceType } from '../../service-catalog/service-type.entity';

describe('ResourceAvailabilityService (Unit - Section G & Customer Technician Selection)', () => {
  let service: ResourceAvailabilityService;
  let mockSettingsRepo: { findOne: jest.Mock };
  let mockServiceTypeRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockAvailabilityRepo: {
    countFreePerSlot: jest.Mock;
    findFreeTechniciansPerSlot: jest.Mock;
    findFreeTechniciansForWindow: jest.Mock;
  };
  let mockClock: { now: jest.Mock };
  let slotPolicy: SlotPolicy;

  beforeEach(() => {
    mockSettingsRepo = {
      findOne: jest.fn(),
    };
    mockServiceTypeRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
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
    const mockSettings: Partial<WorkshopSettings> = {
      dealershipId: '1',
      tenantId: '1',
      timezone: 'Asia/Ho_Chi_Minh',
      opensAt: '08:00:00',
      closesAt: '10:00:00', // 2 hours = 01:00 to 03:00 UTC
      slotMinutes: 30,
      bufferMinutes: 15,
      leadTimeMinutes: 0,
      horizonDays: 30,
    };

    const mockServiceType: Partial<ServiceType> = {
      id: '1',
      tenantId: '1',
      skillId: '1',
      durationMinutes: 45, // occupied = 60m
    };

    mockSettingsRepo.findOne.mockResolvedValue(mockSettings);
    mockServiceTypeRepo.findOne.mockResolvedValue(mockServiceType);

    const slot1Start = new Date('2030-01-01T01:00:00.000Z').getTime();
    const slot2Start = new Date('2030-01-01T01:30:00.000Z').getTime();

    const countsMap = new Map();
    countsMap.set(slot1Start, { freeBays: 5, freeTechnicians: 3 }); // min = 3
    countsMap.set(slot2Start, { freeBays: 2, freeTechnicians: 4 }); // min = 2

    const techsMap = new Map();
    techsMap.set(slot1Start, [
      { id: '1', name: 'Technician 01', skillIds: ['1'] },
      { id: '2', name: 'Technician 02', skillIds: ['1', '2'] },
    ]);
    techsMap.set(slot2Start, [
      { id: '3', name: 'Technician 03', skillIds: ['1'] },
    ]);

    mockAvailabilityRepo.countFreePerSlot.mockResolvedValue(countsMap);
    mockAvailabilityRepo.findFreeTechniciansPerSlot.mockResolvedValue(techsMap);

    const result = await service.getAvailability('1', '1', '1', '2030-01-01');

    expect(result).toBeDefined();
    expect(result.dealershipId).toBe('1');
    expect(result.serviceTypeId).toBe('1');
    expect(result.slots.length).toBeGreaterThanOrEqual(2);

    expect(result.slots[0].startAt).toBe('2030-01-01T01:00:00.000Z');
    expect(result.slots[0].freeBays).toBe(5);
    expect(result.slots[0].freeTechnicians).toBe(3);
    expect(result.slots[0].remainingCapacity).toBe(3);
    expect(result.slots[0].isAvailable).toBe(true);
    expect(result.slots[0].availableTechnicians).toHaveLength(2);
    expect(result.slots[0].availableTechnicians[0].name).toBe('Technician 01');

    // Verify batch queries executed without N+1
    expect(mockAvailabilityRepo.countFreePerSlot).toHaveBeenCalledTimes(1);
    expect(mockAvailabilityRepo.findFreeTechniciansPerSlot).toHaveBeenCalledTimes(1);
  });

  it('should retrieve dealership available slots organized by slot with available technicians and service types', async () => {
    const mockSettings: Partial<WorkshopSettings> = {
      dealershipId: '1',
      tenantId: '1',
      timezone: 'Asia/Ho_Chi_Minh',
      opensAt: '08:00:00',
      closesAt: '09:00:00', // 1 hour = 2 slots (08:00, 08:30)
      slotMinutes: 30,
      bufferMinutes: 15,
      leadTimeMinutes: 0,
      horizonDays: 30,
    };

    const mockServiceTypes: Partial<ServiceType>[] = [
      { id: '1', code: 'OIL_FILTER', name: 'Standard Oil & Filter Service', tenantId: '1', skillId: '1', durationMinutes: 15 },
      { id: '2', code: 'FULL_BRAKE', name: 'Full Brake System Service', tenantId: '1', skillId: '2', durationMinutes: 45 },
    ];

    mockSettingsRepo.findOne.mockResolvedValue(mockSettings);
    mockServiceTypeRepo.find.mockResolvedValue(mockServiceTypes);

    const slot1Start = new Date('2030-01-01T01:00:00.000Z').getTime();

    const countsMap = new Map();
    countsMap.set(slot1Start, { freeBays: 4, freeTechnicians: 3 });

    const techsMap = new Map();
    techsMap.set(slot1Start, [{ id: '1', name: 'Technician 01', skillIds: ['1'] }]);

    mockAvailabilityRepo.countFreePerSlot.mockResolvedValue(countsMap);
    mockAvailabilityRepo.findFreeTechniciansPerSlot.mockResolvedValue(techsMap);

    const result = await service.getDealershipAvailableSlots(
      '1',
      '1',
      '2030-01-01',
    );

    expect(result).toBeDefined();
    expect(result.dealershipId).toBe('1');
    expect(result.dealershipName).toBe('Central Dealership');
    expect(result.date).toBe('2030-01-01');
    expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(result.slotMinutes).toBe(30);
    expect(result.slots.length).toBeGreaterThanOrEqual(1);

    const firstSlot = result.slots[0];
    expect(firstSlot.startAt).toBe('2030-01-01T01:00:00.000Z');
    expect(firstSlot.displayTime).toBe('08:00');
    expect(firstSlot.meetsLeadTime).toBe(true);
    expect(firstSlot.availableTechnicians).toBeDefined();
    expect(firstSlot.availableTechnicians[0].name).toBe('Technician 01');

    expect(firstSlot.availableServiceTypes.length).toBeGreaterThanOrEqual(1);
    expect(firstSlot.availableServiceTypes[0].code).toBe('OIL_FILTER');
    expect(firstSlot.availableServiceTypes[0].remainingCapacity).toBe(3);
    expect(firstSlot.availableServiceTypes[0].availableTechnicians[0].name).toBe('Technician 01');
  });

  it('should retrieve free technicians for a specific slot window', async () => {
    const mockSettings: Partial<WorkshopSettings> = {
      dealershipId: '1',
      tenantId: '1',
      bufferMinutes: 15,
    };
    const mockServiceType: Partial<ServiceType> = {
      id: '1',
      tenantId: '1',
      skillId: '1',
      durationMinutes: 45,
    };

    mockSettingsRepo.findOne.mockResolvedValue(mockSettings);
    mockServiceTypeRepo.findOne.mockResolvedValue(mockServiceType);
    mockAvailabilityRepo.findFreeTechniciansForWindow.mockResolvedValue([
      { id: '1', name: 'Technician 01', skillIds: ['1'] },
    ]);

    const result = await service.getTechniciansForSlot(
      '1',
      '1',
      '1',
      '2030-01-01T01:00:00.000Z',
    );

    expect(result).toBeDefined();
    expect(result.dealershipId).toBe('1');
    expect(result.technicians).toHaveLength(1);
    expect(result.technicians[0].name).toBe('Technician 01');
    expect(result.occupiedUntil).toBe('2030-01-01T02:00:00.000Z'); // 45m + 15m = 60m
  });
});
