import { ReassignAppointmentUseCase } from '../usecases/reassign-appointment.usecase';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { ForbiddenDomainException } from '@app/common';

describe('ReassignAppointmentUseCase (Unit - Staff Resource Management)', () => {
  let useCase: ReassignAppointmentUseCase;
  let mockDataSource: any;
  let mockEvents: any;
  let mockLocks: any;
  let mockAppointmentRepo: any;
  let mockAvailability: any;
  let mockServiceTypeRepo: any;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {};

    mockDataSource = {
      transaction: jest.fn((callback) => callback(mockManager)),
    };

    mockEvents = {
      recordReassigned: jest.fn().mockResolvedValue(undefined),
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
      technicianHasRequiredSkills: jest.fn().mockResolvedValue(true),
      isTechnicianFree: jest.fn().mockResolvedValue(true),
      isBayFree: jest.fn().mockResolvedValue(true),
    };

    mockServiceTypeRepo = {
      getByIdsOrFail: jest.fn().mockResolvedValue([{ id: '1', skillId: '1' }]),
    };

    useCase = new ReassignAppointmentUseCase(
      mockDataSource,
      mockEvents,
      mockLocks,
      mockAppointmentRepo,
      mockAvailability,
      mockServiceTypeRepo,
    );
  });

  it('should successfully reassign technician when skills and slot are available', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      occupiedUntil: new Date('2030-01-01T09:00:00.000Z'),
      technicianId: '1',
      serviceBayId: '1',
      serviceTypeId: '1',
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);

    const result = await useCase.execute(
      existing.id,
      { technicianId: '2', reason: 'Staff rebalance' },
      { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
    );

    expect(result.technicianId).toBe('2');
    expect(mockEvents.recordReassigned).toHaveBeenCalled();
  });

  it('should reject reassignment if technician lacks required skills', async () => {
    const existing: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      occupiedUntil: new Date('2030-01-01T09:00:00.000Z'),
      technicianId: '1',
      serviceBayId: '1',
      serviceTypeId: '1',
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };
    mockAppointmentRepo.findByIdWithLock.mockResolvedValue(existing);
    mockAvailability.technicianHasRequiredSkills.mockResolvedValue(false);

    await expect(
      useCase.execute(
        existing.id,
        { technicianId: '99' },
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      ),
    ).rejects.toThrow('does not possess the required skills');
  });

  it('should reject non-staff users from calling reassign', async () => {
    await expect(
      useCase.execute(
        'a1111111-1111-1111-1111-111111111111',
        { technicianId: '2' },
        { actorSub: 'cust-uuid', actorType: 'customer', tenantId: '1' },
      ),
    ).rejects.toThrow(ForbiddenDomainException);
  });
});
