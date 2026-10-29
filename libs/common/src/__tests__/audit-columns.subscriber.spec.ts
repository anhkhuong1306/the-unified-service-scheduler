import { InsertEvent, UpdateEvent } from 'typeorm';
import { RequestContextService } from '../context/request-context.service';
import {
  AuditableEntityRecord,
  AuditColumnsSubscriber,
} from '../database/audit-columns.subscriber';

describe('AuditColumnsSubscriber with AsyncLocalStorage (§5 & §7.5 SYSTEM_DESIGN.md)', () => {
  beforeEach(() => {
    RequestContextService.reset();
  });

  afterEach(() => {
    RequestContextService.reset();
  });

  it('populates created_by, updated_by, and cancellation fields with JWT sub for customer and staff actors', () => {
    const customerSub = '11111111-2222-4333-8444-555555555555';
    const staffSub = '99999999-8888-4777-8666-555555555555';
    const subscriber = new AuditColumnsSubscriber();

    const appointmentEntity: AuditableEntityRecord = {
      created_by: null,
      updated_by: null,
      cancelled_by: null,
      cancelled_at: null,
      cancel_reason: null,
    };

    // 1. Customer creates appointment
    RequestContextService.run(
      {
        actorSub: customerSub,
        actorType: 'customer',
      },
      () => {
        subscriber.beforeInsert({
          entity: appointmentEntity,
        } as unknown as InsertEvent<AuditableEntityRecord>);
      },
    );

    expect(appointmentEntity.created_by).toBe(customerSub);
    expect(appointmentEntity.updated_by).toBe(customerSub);
    expect(appointmentEntity.cancelled_by).toBeNull();

    // 2. Staff approves / updates appointment
    RequestContextService.run(
      {
        actorSub: staffSub,
        actorType: 'staff',
      },
      () => {
        subscriber.beforeUpdate({
          entity: appointmentEntity,
        } as unknown as UpdateEvent<AuditableEntityRecord>);
      },
    );

    expect(appointmentEntity.created_by).toBe(customerSub);
    expect(appointmentEntity.updated_by).toBe(staffSub);

    // 3. Customer soft-cancels appointment with reason
    const cancelledAt = new Date('2026-11-01T08:30:00.000Z');
    RequestContextService.run(
      {
        actorSub: customerSub,
        actorType: 'customer',
      },
      () => {
        AuditColumnsSubscriber.markCancelled(
          appointmentEntity,
          'Changed plans',
          cancelledAt,
        );
      },
    );

    expect(appointmentEntity.cancelled_by).toBe(customerSub);
    expect(appointmentEntity.cancelled_at).toBe(cancelledAt);
    expect(appointmentEntity.cancel_reason).toBe('Changed plans');
    expect(appointmentEntity.updated_by).toBe(customerSub);
  });

  it('sets created_by, updated_by, and cancelled_by to null when executed by system actor (e.g. ExpirePendingAppointmentsCron)', () => {
    // Case 1: actorType === 'system' (even if actorSub is passed)
    RequestContextService.run(
      {
        actorSub: '00000000-0000-4000-8000-000000000000',
        actorType: 'system',
      },
      () => {
        const systemEntity: AuditableEntityRecord = {};

        AuditColumnsSubscriber.applyAuditOnCreate(systemEntity);
        expect(systemEntity.created_by).toBeNull();
        expect(systemEntity.updated_by).toBeNull();

        AuditColumnsSubscriber.applyAuditOnUpdate(systemEntity);
        expect(systemEntity.updated_by).toBeNull();

        const expiryTime = new Date('2026-11-01T06:00:00.000Z');
        AuditColumnsSubscriber.markCancelled(
          systemEntity,
          'Expired by ExpirePendingAppointmentsCron',
          expiryTime,
        );

        expect(systemEntity.cancelled_by).toBeNull();
        expect(systemEntity.cancelled_at).toBe(expiryTime);
        expect(systemEntity.cancel_reason).toBe(
          'Expired by ExpirePendingAppointmentsCron',
        );
        expect(systemEntity.updated_by).toBeNull();
      },
    );

    // Case 2: unauthenticated context (actorSub: null)
    RequestContextService.run(
      {
        actorSub: null,
        actorType: 'customer',
      },
      () => {
        const unauthEntity: AuditableEntityRecord = {};
        AuditColumnsSubscriber.applyAuditOnCreate(unauthEntity);
        AuditColumnsSubscriber.markCancelled(unauthEntity, 'System cleanup');

        expect(unauthEntity.created_by).toBeNull();
        expect(unauthEntity.updated_by).toBeNull();
        expect(unauthEntity.cancelled_by).toBeNull();
      },
    );
  });
});
