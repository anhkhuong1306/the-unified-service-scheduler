import { CancelAppointmentUseCase } from '../cancel-appointment.usecase';
import {
  InvalidStateTransitionException,
  ResourceNotFoundException,
} from '@app/common';
import { AppointmentStatus } from '../appointment-status.enum';

describe('CancelAppointmentUseCase (Unit - Refactored)', () => {
  let useCase: CancelAppointmentUseCase;
  let mockDataSource: any;
  let mockCustomers: any;
  let mockEvents: any;
  let mockClock: any;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {
      findOne: jest.fn(),
      save: jest.fn((entityClass, data) => Promise.resolve(data)),
    };

    mockDataSource = {
      transaction: jest.fn((callback) => callback(mockManager)),
    };

    mockCustomers = {
      resolve: jest.fn().mockResolvedValue({ id: '1', name: 'Nguyen Van A' }),
    };

    mockEvents = {
      recordCancelled: jest.fn().mockResolvedValue(undefined),
    };

    mockClock = {
      now: jest.fn().mockReturnValue(new Date('2030-01-01T08:00:00.000Z')),
    };

    useCase = new CancelAppointmentUseCase(
      mockDataSource,
      mockCustomers,
      mockEvents,
      mockClock,
    );
  });

  it('should successfully cancel appointment using pessimistic lock, update status and emit event', async () => {
    const mockAppt = {
      id: 'apt-1',
      dealershipId: '1',
      customerId: '1',
      status: AppointmentStatus.CONFIRMED,
      startAt: new Date('2030-01-01T12:00:00.000Z'), // 4 hours away (cutoff is 2 hours)
      cancel: jest.fn().mockReturnValue(AppointmentStatus.CONFIRMED),
    };

    mockManager.findOne
      .mockResolvedValueOnce(mockAppt) // find appointment with pessimistic lock
      .mockResolvedValueOnce({
        dealershipId: '1',
        cancellationCutoffMinutes: 120, // 2 hours
      }); // settings

    const result = await useCase.execute('apt-1', 'Personal reasons', {
      actorSub: 'sub-user-1',
      actorType: 'customer',
      tenantId: '1',
    });

    expect(result).toBeDefined();
    expect(mockAppt.cancel).toHaveBeenCalled();
    expect(mockEvents.recordCancelled).toHaveBeenCalled();
  });

  it('should throw ResourceNotFoundException if appointment belongs to another customer (A7 IDOR fix)', async () => {
    const mockAppt = {
      id: 'apt-other',
      dealershipId: '1',
      customerId: '999', // belongs to customer 999, but actor is customer 1
      status: AppointmentStatus.CONFIRMED,
    };

    mockManager.findOne.mockResolvedValueOnce(mockAppt);

    await expect(
      useCase.execute('apt-other', 'Cancel attempt', {
        actorSub: 'sub-user-1',
        actorType: 'customer',
        tenantId: '1',
      }),
    ).rejects.toThrow(ResourceNotFoundException);
  });

  it('should throw InvalidStateTransitionException if cancellation cutoff is exceeded (A8)', async () => {
    const mockAppt = {
      id: 'apt-1',
      dealershipId: '1',
      customerId: '1',
      status: AppointmentStatus.CONFIRMED,
      startAt: new Date('2030-01-01T08:30:00.000Z'), // only 30 mins away
    };

    mockManager.findOne
      .mockResolvedValueOnce(mockAppt)
      .mockResolvedValueOnce({
        dealershipId: '1',
        cancellationCutoffMinutes: 120, // cutoff is 2 hours before start!
      });

    await expect(
      useCase.execute('apt-1', 'Late cancellation', {
        actorSub: 'sub-user-1',
        actorType: 'customer',
        tenantId: '1',
      }),
    ).rejects.toThrow(InvalidStateTransitionException);
  });
});
