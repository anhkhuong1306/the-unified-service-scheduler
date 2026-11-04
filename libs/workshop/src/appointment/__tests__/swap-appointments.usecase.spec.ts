import { SwapAppointmentsUseCase } from '../usecases/swap-appointments.usecase';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { InvalidStateTransitionException } from '@app/common';

describe('SwapAppointmentsUseCase (Unit - Concurrency & Boundary Protection)', () => {
  let useCase: SwapAppointmentsUseCase;
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
      recordSwapped: jest.fn().mockResolvedValue(undefined),
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
      isBayFree: jest.fn().mockResolvedValue(true),
      isTechnicianFree: jest.fn().mockResolvedValue(true),
      technicianHasRequiredSkills: jest.fn().mockResolvedValue(true),
      hasVehicleOverlap: jest.fn().mockResolvedValue(false),
    };

    mockServiceTypeRepo = {
      getByIdsOrFail: jest.fn().mockResolvedValue([{ id: '1', skillId: '1' }]),
    };

    useCase = new SwapAppointmentsUseCase(
      mockDataSource,
      mockEvents,
      mockLocks,
      mockAppointmentRepo,
      mockAvailability,
      mockServiceTypeRepo,
    );
  });

  it('should successfully swap two appointments with matching duration and skills', async () => {
    const apptA: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      endAt: new Date('2030-01-01T08:45:00.000Z'),
      occupiedUntil: new Date('2030-01-01T09:00:00.000Z'),
      serviceBayId: '1',
      technicianId: '1',
      serviceTypeId: '1',
      serviceTypeIds: ['1'],
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };

    const apptB: any = {
      id: 'b2222222-2222-2222-2222-222222222222',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      endAt: new Date('2030-01-01T09:45:00.000Z'),
      occupiedUntil: new Date('2030-01-01T10:00:00.000Z'),
      serviceBayId: '2',
      technicianId: '2',
      serviceTypeId: '1',
      serviceTypeIds: ['1'],
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };

    mockAppointmentRepo.findByIdWithLock.mockImplementation((m: any, id: string) => {
      if (id === apptA.id) return Promise.resolve(apptA);
      if (id === apptB.id) return Promise.resolve(apptB);
      return Promise.resolve(null);
    });

    const result = await useCase.execute(
      {
        appointmentIdA: apptA.id,
        appointmentIdB: apptB.id,
      },
      {
        actorSub: 'staff-uuid',
        actorType: 'staff',
        tenantId: '1',
      },
    );

    expect(result.appointmentA.startAt).toEqual(new Date('2030-01-01T09:00:00.000Z'));
    expect(result.appointmentB.startAt).toEqual(new Date('2030-01-01T08:00:00.000Z'));
    expect(mockEvents.recordSwapped).toHaveBeenCalledTimes(2);
  });

  it('TC_SWAP_003: should reject swap when duration mismatch causes slot overlap between appointments', async () => {
    // Appointment A: 08:00 - 09:00 (1 hour duration) on Bay 1, Tech 1
    const apptA: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      endAt: new Date('2030-01-01T08:45:00.000Z'),
      occupiedUntil: new Date('2030-01-01T09:00:00.000Z'),
      serviceBayId: '1',
      technicianId: '1',
      serviceTypeId: '1',
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };

    // Appointment B: 09:00 - 11:00 (2 hours duration!) on Bay 1 (or swapping to Bay 1)
    const apptB: any = {
      id: 'b2222222-2222-2222-2222-222222222222',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      endAt: new Date('2030-01-01T10:45:00.000Z'),
      occupiedUntil: new Date('2030-01-01T11:00:00.000Z'),
      serviceBayId: '1', // same bay
      technicianId: '1',
      serviceTypeId: '2',
      status: AppointmentStatus.CONFIRMED,
      version: 1,
    };

    mockAppointmentRepo.findByIdWithLock.mockImplementation((m: any, id: string) => {
      if (id === apptA.id) return Promise.resolve(apptA);
      if (id === apptB.id) return Promise.resolve(apptB);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute(
        {
          appointmentIdA: apptA.id,
          appointmentIdB: apptB.id,
        },
        {
          actorSub: 'staff-uuid',
          actorType: 'staff',
          tenantId: '1',
        },
      ),
    ).rejects.toThrow('Duration mismatch causes slot overlap between the two appointments');
  });

  it('should reject swap if appointments belong to different dealerships', async () => {
    const apptA: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      status: AppointmentStatus.CONFIRMED,
    };
    const apptB: any = {
      id: 'b2222222-2222-2222-2222-222222222222',
      dealershipId: '2',
      status: AppointmentStatus.CONFIRMED,
    };

    mockAppointmentRepo.findByIdWithLock.mockImplementation((m: any, id: string) => {
      if (id === apptA.id) return Promise.resolve(apptA);
      if (id === apptB.id) return Promise.resolve(apptB);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute(
        { appointmentIdA: apptA.id, appointmentIdB: apptB.id },
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      ),
    ).rejects.toThrow('Cannot swap appointments belonging to different dealerships');
  });

  it('should reject swap if an appointment is already COMPLETED or CANCELLED', async () => {
    const apptA: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      status: AppointmentStatus.COMPLETED,
    };
    const apptB: any = {
      id: 'b2222222-2222-2222-2222-222222222222',
      dealershipId: '1',
      status: AppointmentStatus.CONFIRMED,
    };

    mockAppointmentRepo.findByIdWithLock.mockImplementation((m: any, id: string) => {
      if (id === apptA.id) return Promise.resolve(apptA);
      if (id === apptB.id) return Promise.resolve(apptB);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute(
        { appointmentIdA: apptA.id, appointmentIdB: apptB.id },
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      ),
    ).rejects.toThrow(InvalidStateTransitionException);
  });

  it('should reject swap if staff belongs to another dealership', async () => {
    const apptA: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      status: AppointmentStatus.CONFIRMED,
    };
    const apptB: any = {
      id: 'b2222222-2222-2222-2222-222222222222',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      status: AppointmentStatus.CONFIRMED,
    };

    mockAppointmentRepo.findByIdWithLock.mockImplementation((m: any, id: string) => {
      if (id === apptA.id) return Promise.resolve(apptA);
      if (id === apptB.id) return Promise.resolve(apptB);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute(
        { appointmentIdA: apptA.id, appointmentIdB: apptB.id },
        { actorSub: 'staff-south-uuid', actorType: 'staff', tenantId: '1', dealershipId: '2' },
      ),
    ).rejects.toThrow(ForbiddenDomainException);
  });

  it('should reject swap if either appointment is in the past', async () => {
    const apptA: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2020-01-01T08:00:00.000Z'), // in past
      status: AppointmentStatus.CONFIRMED,
    };
    const apptB: any = {
      id: 'b2222222-2222-2222-2222-222222222222',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      status: AppointmentStatus.CONFIRMED,
    };

    mockAppointmentRepo.findByIdWithLock.mockImplementation((m: any, id: string) => {
      if (id === apptA.id) return Promise.resolve(apptA);
      if (id === apptB.id) return Promise.resolve(apptB);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute(
        { appointmentIdA: apptA.id, appointmentIdB: apptB.id },
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1', dealershipId: '1' },
      ),
    ).rejects.toThrow('Cannot swap appointments that are already in the past');
  });

  it('should reject swap if either appointment is CHECKED_IN or IN_PROGRESS', async () => {
    const apptA: any = {
      id: 'a1111111-1111-1111-1111-111111111111',
      dealershipId: '1',
      startAt: new Date('2030-01-01T08:00:00.000Z'),
      status: AppointmentStatus.CHECKED_IN,
    };
    const apptB: any = {
      id: 'b2222222-2222-2222-2222-222222222222',
      dealershipId: '1',
      startAt: new Date('2030-01-01T09:00:00.000Z'),
      status: AppointmentStatus.CONFIRMED,
    };

    mockAppointmentRepo.findByIdWithLock.mockImplementation((m: any, id: string) => {
      if (id === apptA.id) return Promise.resolve(apptA);
      if (id === apptB.id) return Promise.resolve(apptB);
      return Promise.resolve(null);
    });

    await expect(
      useCase.execute(
        { appointmentIdA: apptA.id, appointmentIdB: apptB.id },
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1', dealershipId: '1' },
      ),
    ).rejects.toThrow('Appointments can only be swapped when status is PENDING or CONFIRMED');
  });
});
