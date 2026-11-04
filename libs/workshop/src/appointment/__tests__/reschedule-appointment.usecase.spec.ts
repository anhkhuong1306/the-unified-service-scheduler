import { RescheduleAppointmentUseCase } from '../usecases/reschedule-appointment.usecase';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { ForbiddenDomainException } from '@app/common';

describe('RescheduleAppointmentUseCase (Unit - Early Arrival & Lead-Time Bypass)', () => {
  let useCase: RescheduleAppointmentUseCase;
  let mockDataSource: any;
  let mockEvents: any;
  let mockLocks: any;
  let mockAppointmentRepo: any;
  let mockAvailability: any;
  let mockSettingsRepo: any;
  let mockServiceTypeRepo: any;
  let mockSlotValidator: any;
  let mockAllocator: any;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {};

    mockDataSource = {
      transaction: jest.fn((callback) => callback(mockManager)),
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

    mockAvailability = {
      hasVehicleOverlap: jest.fn().mockResolvedValue(false),
    };

    mockSettingsRepo = {
      getByDealershipIdOrFail: jest.fn().mockResolvedValue({
        dealershipId: '1',
      }),
    };

    mockServiceTypeRepo = {
      getByIdsOrFail: jest.fn().mockResolvedValue([{ id: '1', skillId: '1' }]),
    };

    mockSlotValidator = {
      resolveAndValidateSlot: jest.fn().mockReturnValue({
        startAt: new Date('2030-01-01T07:30:00.000Z'),
        endAt: new Date('2030-01-01T08:15:00.000Z'),
        occupiedUntil: new Date('2030-01-01T08:30:00.000Z'),
      }),
    };

    mockAllocator = {
      allocate: jest.fn().mockResolvedValue({ bayId: '1', technicianId: '2' }),
    };

    useCase = new RescheduleAppointmentUseCase(
      mockDataSource,
      mockEvents,
      mockLocks,
      mockAppointmentRepo,
      mockAvailability,
      mockSettingsRepo,
      mockServiceTypeRepo,
      mockSlotValidator,
      mockAllocator,
    );
  });

  it('should allow staff to reschedule appointment to earlier slot (Early Arrival scenario)', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      serviceTypeId: '1',
      serviceTypeIds: ['1'],
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    const result = await useCase.execute(
      existing.id,
      {
        newStartAt: '2030-01-01T07:30:00.000Z',
        notes: 'Customer arrived early',
      },
      {
        actorSub: 'staff-uuid',
        actorType: 'staff',
        tenantId: '1',
      },
    );

    expect(result.startAt).toEqual(new Date('2030-01-01T07:30:00.000Z'));
    expect(mockEvents.recordUpdated).toHaveBeenCalled();
  });

  it('should reject staff from another dealership trying to reschedule appointment', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      serviceTypeId: '1',
      serviceTypeIds: ['1'],
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    await expect(
      useCase.execute(
        existing.id,
        { startAt: '2030-01-01T07:30:00.000Z' },
        { actorSub: 'staff-south-uuid', actorType: 'staff', tenantId: '1', dealershipId: '2' },
      ),
    ).rejects.toThrow(ForbiddenDomainException);
  });

  it('should reject rescheduling past appointments', async () => {
    const pastAppt: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2020-01-01T09:00:00.000Z'), // in past
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(pastAppt);

    await expect(
      useCase.execute(
        pastAppt.id,
        { startAt: '2030-01-01T07:30:00.000Z' },
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1', dealershipId: '1' },
      ),
    ).rejects.toThrow('Cannot modify an appointment that is already in the past');
  });

  it('should reject rescheduling to a past target time', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    await expect(
      useCase.execute(
        existing.id,
        { startAt: '2020-01-01T07:30:00.000Z' }, // target in past
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1', dealershipId: '1' },
      ),
    ).rejects.toThrow('New appointment start time cannot be in the past');
  });

  it('should reject rescheduling appointment with status other than PENDING or CONFIRMED', async () => {
    const inProgressAppt: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      status: AppointmentStatus.IN_PROGRESS,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(inProgressAppt);

    await expect(
      useCase.execute(
        inProgressAppt.id,
        { startAt: '2030-01-01T10:00:00.000Z' },
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1', dealershipId: '1' },
      ),
    ).rejects.toThrow('Only PENDING or CONFIRMED appointments can be modified');
  });

  it('should reject non-staff users from calling reschedule', async () => {
    await expect(
      useCase.execute(
        'a1111111-1111-1111-1111-111111111111',
        { newStartAt: '2030-01-01T07:30:00.000Z' },
        { actorSub: 'cust-uuid', actorType: 'customer', tenantId: '1' },
      ),
    ).rejects.toThrow(ForbiddenDomainException);
  });
});
