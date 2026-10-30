import { CreateAppointmentUseCase } from '../create-appointment.usecase';
import {
  ActiveAppointmentLimitReachedException,
  SlotUnavailableException,
  VehicleAlreadyBookedException,
} from '@app/common';
import { AppointmentStatus } from '../appointment-status.enum';

describe('CreateAppointmentUseCase (Unit - Refactored with SlotPolicy)', () => {
  let useCase: CreateAppointmentUseCase;
  let mockDataSource: any;
  let mockCustomers: any;
  let mockIdempotency: any;
  let mockLocks: any;
  let mockAvailability: any;
  let mockAllocator: any;
  let mockRefCodes: any;
  let mockEvents: any;
  let mockClock: any;
  let mockSlotPolicy: any;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {
      findOne: jest.fn(),
      count: jest.fn(),
      create: jest.fn((entityClass, data) => data),
      save: jest.fn((entityClass, data) =>
        Promise.resolve({ id: 'apt-uuid-1', ...data }),
      ),
    };

    mockDataSource = {
      transaction: jest.fn((callback) => callback(mockManager)),
    };

    mockCustomers = {
      resolve: jest.fn().mockResolvedValue({ id: '1', name: 'Nguyen Van A' }),
      requireVehicle: jest.fn().mockResolvedValue({
        id: '1',
        customerId: '1',
        customerName: 'Nguyen Van A',
        licensePlate: '51A-123.45',
        vehicleLabel: '2020 Honda Accord',
      }),
    };

    mockIdempotency = {
      begin: jest.fn().mockResolvedValue(null),
      complete: jest.fn().mockResolvedValue(undefined),
    };

    mockLocks = {
      setLocalTimeouts: jest.fn().mockResolvedValue(undefined),
      lockCustomer: jest.fn().mockResolvedValue(undefined),
      lockDealership: jest.fn().mockResolvedValue(undefined),
    };

    mockAvailability = {
      hasVehicleOverlap: jest.fn().mockResolvedValue(false),
    };

    mockAllocator = {
      allocate: jest.fn().mockResolvedValue({
        bayId: '1',
        technicianId: '1',
      }),
    };

    mockRefCodes = {
      generate: jest.fn().mockReturnValue('APT-20300101-ABCD1234'),
    };

    mockEvents = {
      recordCreated: jest.fn().mockResolvedValue(undefined),
    };

    mockClock = {
      now: jest.fn().mockReturnValue(new Date('2029-01-01T00:00:00.000Z')),
    };

    mockSlotPolicy = {
      generate: jest.fn().mockReturnValue([
        {
          startAt: new Date('2030-01-01T01:00:00.000Z'),
          endAt: new Date('2030-01-01T01:45:00.000Z'),
          occupiedUntil: new Date('2030-01-01T02:00:00.000Z'),
          meetsLeadTime: true,
        },
      ]),
    };

    useCase = new CreateAppointmentUseCase(
      mockDataSource,
      mockCustomers,
      mockIdempotency,
      mockLocks,
      mockAvailability,
      mockAllocator,
      mockRefCodes,
      mockEvents,
      mockClock,
      mockSlotPolicy,
    );
  });

  it('should successfully orchestrate booking creation with SlotPolicy alignment, locks & idempotency', async () => {
    mockManager.findOne
      .mockResolvedValueOnce({
        dealershipId: '1',
        tenantId: '1',
        timezone: 'Asia/Ho_Chi_Minh',
        bufferMinutes: 15,
        maxActivePerCustomer: 3,
        requiresApproval: false,
      }) // settings
      .mockResolvedValueOnce({
        id: '1',
        tenantId: '1',
        skillId: '1',
        durationMinutes: 45,
      }); // serviceType

    mockManager.count.mockResolvedValue(0);

    const result = await useCase.execute(
      {
        dealershipId: '1',
        vehicleId: '1',
        serviceTypeId: '1',
        startAt: '2030-01-01T01:00:00.000Z',
      },
      {
        actorSub: 'sub-user-1',
        actorType: 'customer',
        tenantId: '1',
      },
      'idem-key-1',
    );

    expect(result).toBeDefined();
    expect(result.status).toBe(AppointmentStatus.CONFIRMED);
    expect(result.serviceBayId).toBe('1');
    expect(result.technicianId).toBe('1');
    expect(result.referenceCode).toBe('APT-20300101-ABCD1234');

    expect(mockSlotPolicy.generate).toHaveBeenCalled();
    expect(mockLocks.setLocalTimeouts).toHaveBeenCalled();
    expect(mockLocks.lockCustomer).toHaveBeenCalledWith(mockManager, '1');
    expect(mockLocks.lockDealership).toHaveBeenCalledWith(mockManager, '1');
    expect(mockIdempotency.begin).toHaveBeenCalled();
    expect(mockIdempotency.complete).toHaveBeenCalled();
    expect(mockEvents.recordCreated).toHaveBeenCalled();
  });

  it('should return cached appointment on idempotency replay (A1, A2)', async () => {
    mockIdempotency.begin.mockResolvedValueOnce({ id: 'cached-apt-uuid' });
    const cachedApt = { id: 'cached-apt-uuid', status: AppointmentStatus.CONFIRMED };
    mockManager.findOneOrFail = jest.fn().mockResolvedValue(cachedApt);

    const result = await useCase.execute(
      {
        dealershipId: '1',
        vehicleId: '1',
        serviceTypeId: '1',
        startAt: '2030-01-01T01:00:00.000Z',
      },
      {
        actorSub: 'sub-user-1',
        actorType: 'customer',
        tenantId: '1',
      },
      'idem-key-replay',
    );

    expect(result).toBe(cachedApt);
    expect(mockManager.save).not.toHaveBeenCalled();
    expect(mockLocks.lockCustomer).not.toHaveBeenCalled();
  });

  it('should throw ActiveAppointmentLimitReachedException when active appointment limit reached', async () => {
    mockManager.findOne
      .mockResolvedValueOnce({
        dealershipId: '1',
        tenantId: '1',
        timezone: 'Asia/Ho_Chi_Minh',
        bufferMinutes: 15,
        maxActivePerCustomer: 3,
      })
      .mockResolvedValueOnce({
        id: '1',
        tenantId: '1',
        skillId: '1',
        durationMinutes: 45,
      });

    mockManager.count.mockResolvedValue(3); // limit reached

    await expect(
      useCase.execute(
        {
          dealershipId: '1',
          vehicleId: '1',
          serviceTypeId: '1',
          startAt: '2030-01-01T01:00:00.000Z',
        },
        {
          actorSub: 'sub-user-1',
          actorType: 'customer',
          tenantId: '1',
        },
      ),
    ).rejects.toThrow(ActiveAppointmentLimitReachedException);
  });
});
