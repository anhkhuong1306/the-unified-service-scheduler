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
