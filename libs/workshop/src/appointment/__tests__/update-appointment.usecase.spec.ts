import { UpdateAppointmentUseCase } from '../usecases/update-appointment.usecase';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { ResourceNotFoundException } from '@app/common';

describe('UpdateAppointmentUseCase (Unit - Concurrency & Boundary)', () => {
  let useCase: UpdateAppointmentUseCase;
  let mockDataSource: any;
  let mockCustomers: any;
  let mockEvents: any;
  let mockLocks: any;
  let mockAppointmentRepo: any;
  let mockDetailRepo: any;
  let mockAvailability: any;
  let mockSettingsRepo: any;
  let mockServiceTypeRepo: any;
  let mockSlotValidator: any;
  let mockAllocator: any;
  let mockClock: any;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {};

    mockDataSource = {
      transaction: jest.fn((callback) => callback(mockManager)),
    };

    mockCustomers = {
      resolve: jest.fn().mockResolvedValue({ id: '1', name: 'Nguyen Van A' }),
      requireVehicle: jest.fn().mockResolvedValue({
        id: '1',
        licensePlate: '51A-999.99',
        make: 'Toyota',
        model: 'Corolla',
        year: 2022,
      }),
    };

    mockEvents = {
      recordUpdated: jest.fn().mockResolvedValue(undefined),
    };

    mockLocks = {
      setLocalTimeouts: jest.fn().mockResolvedValue(undefined),
      lockDealership: jest.fn().mockResolvedValue(undefined),
    };

    mockAppointmentRepo = {
      findByIdWithLock: jest.fn(),
      saveTransactional: jest.fn((m, entity) => Promise.resolve(entity)),
    };

    mockDetailRepo = {
      deleteByAppointmentIdTransactional: jest.fn().mockResolvedValue(undefined),
      saveDetailsTransactional: jest.fn((m, details) => Promise.resolve(details)),
    };

    mockAvailability = {
      hasVehicleOverlap: jest.fn().mockResolvedValue(false),
      isTechnicianFree: jest.fn().mockResolvedValue(true),
      isBayFree: jest.fn().mockResolvedValue(true),
      technicianHasRequiredSkills: jest.fn().mockResolvedValue(true),
    };

    mockSettingsRepo = {
      getByDealershipIdOrFail: jest.fn().mockResolvedValue({
        dealershipId: '1',
        cancellationCutoffMinutes: 60,
      }),
    };

    mockServiceTypeRepo = {
      getByIdsOrFail: jest.fn().mockResolvedValue([{ id: '1', durationMinutes: 45, skillId: '1' }]),
    };

    mockSlotValidator = {
      resolveAndValidateSlot: jest.fn().mockReturnValue({
        startAt: new Date('2030-01-01T08:00:00.000Z'),
        endAt: new Date('2030-01-01T08:45:00.000Z'),
        occupiedUntil: new Date('2030-01-01T09:00:00.000Z'),
      }),
    };

    mockAllocator = {
      allocate: jest.fn().mockResolvedValue({ bayId: '1', technicianId: '1' }),
    };

    mockClock = {
      now: jest.fn().mockReturnValue(new Date('2030-01-01T00:00:00.000Z')),
    };

    useCase = new UpdateAppointmentUseCase(
      mockDataSource,
      mockCustomers,
      mockEvents,
      mockLocks,
      mockAppointmentRepo,
      mockDetailRepo,
      mockAvailability,
      mockSettingsRepo,
      mockServiceTypeRepo,
      mockSlotValidator,
      mockAllocator,
      mockClock,
    );
  });

  it('should update appointment notes successfully', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      customerId: '1',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    const result = await useCase.execute(
      existing.id,
      { notes: 'Updated customer note', version: 1 },
      { actorSub: 'cust-uuid', actorType: 'customer', tenantId: '1' },
    );

    expect(result.notes).toBe('Updated customer note');
    expect(mockEvents.recordUpdated).toHaveBeenCalled();
  });

  it('should reject update if optimistic lock version mismatches', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      customerId: '1',
      dealershipId: '1',
      status: AppointmentStatus.CONFIRMED,
      version: 2, // version in DB is 2
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    await expect(
      useCase.execute(
        existing.id,
        { notes: 'Note', version: 1 }, // client expected 1
        { actorSub: 'cust-uuid', actorType: 'customer', tenantId: '1' },
      ),
    ).rejects.toThrow('Appointment has been modified by another transaction');
  });

  it('should throw ResourceNotFoundException if customer attempts to update someone elses appointment (IDOR)', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      customerId: '999', // owned by another customer
      dealershipId: '1',
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    await expect(
      useCase.execute(
        existing.id,
        { notes: 'Note' },
        { actorSub: 'cust-uuid', actorType: 'customer', tenantId: '1' },
      ),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('should reject modification if cutoff time has been exceeded', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      customerId: '1',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    // Current time is 07:30 (only 30m before startAt, but cutoff is 60m)
    mockClock.now.mockReturnValue(new Date('2030-01-01T07:30:00.000Z'));

    await expect(
      useCase.execute(
        existing.id,
        { notes: 'Note' },
        { actorSub: 'cust-uuid', actorType: 'customer', tenantId: '1' },
      ),
    ).rejects.toThrow('Modification cutoff exceeded');
  });
});
