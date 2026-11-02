import {
  AppointmentStateMachine,
} from '../state-machine/appointment.state-machine';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { InvalidStateTransitionException } from '@app/common';

describe('AppointmentStateMachine (Unit - Workshop State Flow)', () => {
  let stateMachine: AppointmentStateMachine;

  beforeEach(() => {
    stateMachine = new AppointmentStateMachine();
  });

  describe('Happy Path Transitions', () => {
    it('PENDING -> approve -> CONFIRMED (staff)', () => {
      const next = stateMachine.validateTransition(
        AppointmentStatus.PENDING,
        'approve',
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      );
      expect(next).toBe(AppointmentStatus.CONFIRMED);
    });

    it('PENDING -> reject -> REJECTED (staff)', () => {
      const next = stateMachine.validateTransition(
        AppointmentStatus.PENDING,
        'reject',
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      );
      expect(next).toBe(AppointmentStatus.REJECTED);
    });

    it('CONFIRMED -> check_in -> CHECKED_IN (staff)', () => {
      const next = stateMachine.validateTransition(
        AppointmentStatus.CONFIRMED,
        'check_in',
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      );
      expect(next).toBe(AppointmentStatus.CHECKED_IN);
    });

    it('CHECKED_IN -> start -> IN_PROGRESS (staff)', () => {
      const next = stateMachine.validateTransition(
        AppointmentStatus.CHECKED_IN,
        'start',
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      );
      expect(next).toBe(AppointmentStatus.IN_PROGRESS);
    });

    it('IN_PROGRESS -> complete -> COMPLETED (staff)', () => {
      const next = stateMachine.validateTransition(
        AppointmentStatus.IN_PROGRESS,
        'complete',
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      );
      expect(next).toBe(AppointmentStatus.COMPLETED);
    });

    it('CONFIRMED -> no_show -> NO_SHOW (staff)', () => {
      const next = stateMachine.validateTransition(
        AppointmentStatus.CONFIRMED,
        'no_show',
        { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
      );
      expect(next).toBe(AppointmentStatus.NO_SHOW);
    });

    it('PENDING -> expire -> EXPIRED (system)', () => {
      const next = stateMachine.validateTransition(
        AppointmentStatus.PENDING,
        'expire',
        { actorSub: 'sys', actorType: 'system', tenantId: '1' },
      );
      expect(next).toBe(AppointmentStatus.EXPIRED);
    });
  });

  describe('Illegal / Disallowed Transitions', () => {
    it('should throw InvalidStateTransitionException when jumping from PENDING directly to IN_PROGRESS', () => {
      expect(() =>
        stateMachine.validateTransition(
          AppointmentStatus.PENDING,
          'start',
          { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
        ),
      ).toThrow(InvalidStateTransitionException);
    });

    it('should throw InvalidStateTransitionException when Customer tries to perform Staff action (approve)', () => {
      expect(() =>
        stateMachine.validateTransition(
          AppointmentStatus.PENDING,
          'approve',
          { actorSub: 'cust-uuid', actorType: 'customer', tenantId: '1' },
        ),
      ).toThrow('Actor type "customer" is not authorized to perform action "approve"');
    });

    it('should throw InvalidStateTransitionException when transitioning from terminal status (COMPLETED)', () => {
      expect(() =>
        stateMachine.validateTransition(
          AppointmentStatus.COMPLETED,
          'cancel',
          { actorSub: 'staff-uuid', actorType: 'staff', tenantId: '1' },
        ),
      ).toThrow(InvalidStateTransitionException);
    });
  });
});
