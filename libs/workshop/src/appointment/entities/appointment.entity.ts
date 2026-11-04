import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import {
  BaseAuditEntity,
  DomainException,
  ErrorCode,
  ForbiddenDomainException,
  InvalidStateTransitionException,
} from '@app/common';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { ACTIVE_STATUSES } from '../types/appointment.constants';
import { ActorContext } from '../types/actor-context.interface';
import { AppointmentDetail } from './appointment-detail.entity';

@Entity({ name: 'appointments' })
export class Appointment extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'varchar', length: 64, unique: true, name: 'reference_code' })
  public referenceCode!: string;

  @Column({ type: 'bigint', name: 'dealership_id' })
  public dealershipId!: string;

  @Column({ type: 'bigint', name: 'customer_id' })
  public customerId!: string;

  @Column({ type: 'bigint', name: 'vehicle_id' })
  public vehicleId!: string;

  @Column({ type: 'bigint', name: 'service_type_id' })
  public serviceTypeId!: string;

  @Column({ type: 'bigint', array: true, nullable: true, name: 'service_type_ids', default: '{}' })
  public serviceTypeIds?: string[];

  @OneToMany(() => AppointmentDetail, (item) => item.appointment, {
    cascade: true,
  })
  public details?: AppointmentDetail[];

  public get services(): AppointmentDetail[] | undefined {
    return this.details;
  }

  public set services(items: AppointmentDetail[] | undefined) {
    this.details = items;
  }

  // Rich Master Entities Detail Hydration (Boss Directives)
  public dealership?: { id: string; code: string; name: string };
  public customer?: { id: string; code: string; name: string; email?: string; phone?: string };
  public technician?: { id: string; code: string; name: string };
  public serviceBay?: { id: string; code: string };
  public vehicle?: {
    id: string;
    licensePlate: string;
    make: string;
    model: string;
    year: number;
    vin?: string;
    vehicleLabel?: string;
  };

  @Column({ type: 'bigint', name: 'service_bay_id' })
  public serviceBayId!: string;

  @Column({ type: 'bigint', name: 'technician_id' })
  public technicianId!: string;

  @Column({ type: 'varchar', length: 255, name: 'customer_name' })
  public customerName!: string;

  @Column({ type: 'varchar', length: 50, name: 'vehicle_plate' })
  public vehiclePlate!: string;

  @Column({ type: 'varchar', length: 255, name: 'vehicle_label' })
  public vehicleLabel!: string;

  @Column({ type: 'timestamptz', name: 'start_at' })
  public startAt!: Date;

  @Column({ type: 'timestamptz', name: 'end_at' })
  public endAt!: Date;

  @Column({ type: 'timestamptz', name: 'occupied_until' })
  public occupiedUntil!: Date;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.CONFIRMED,
  })
  public status!: AppointmentStatus;

  @VersionColumn({ default: 1 })
  public version!: number;

  @Column({ type: 'text', nullable: true })
  public notes!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'cancel_reason' })
  public cancelReason!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'cancelled_at' })
  public cancelledAt!: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'cancelled_by' })
  public cancelledBy!: string | null;

  public get cancelled_by(): string | null {
    return this.cancelledBy;
  }

  public set cancelled_by(value: string | null) {
    this.cancelledBy = value;
  }

  /**
   * Checks whether a status is modifiable (PENDING or CONFIRMED).
   */
  public static isModifiable(status: AppointmentStatus): boolean {
    return status === AppointmentStatus.PENDING || status === AppointmentStatus.CONFIRMED;
  }

  /**
   * Checks whether the scheduled start time is in the past relative to referenceTime.
   */
  public static isPast(startAt: Date | string, referenceTime: Date = new Date()): boolean {
    return new Date(startAt).getTime() <= referenceTime.getTime();
  }

  /**
   * Asserts that an appointment is modifiable and not in the past.
   */
  public static assertModifiable(
    appointment: { status: AppointmentStatus; startAt: Date | string },
    action: string = 'modify',
    referenceTime: Date = new Date(),
  ): void {
    if (!Appointment.isModifiable(appointment.status)) {
      throw new InvalidStateTransitionException(
        `Cannot ${action} appointment in ${appointment.status} status. Only PENDING or CONFIRMED appointments can be modified.`,
      );
    }

    if (Appointment.isPast(appointment.startAt, referenceTime)) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Cannot modify an appointment that is already in the past',
        null,
        400,
      );
    }
  }

  /**
   * Asserts that two appointments are swappable (both PENDING/CONFIRMED and not in the past).
   */
  public static assertSwappable(
    apptA: { status: AppointmentStatus; startAt: Date | string },
    apptB: { status: AppointmentStatus; startAt: Date | string },
    referenceTime: Date = new Date(),
  ): void {
    if (!Appointment.isModifiable(apptA.status) || !Appointment.isModifiable(apptB.status)) {
      throw new InvalidStateTransitionException(
        `Appointments can only be swapped when status is PENDING or CONFIRMED (found statuses: A=${apptA.status}, B=${apptB.status})`,
      );
    }

    if (Appointment.isPast(apptA.startAt, referenceTime) || Appointment.isPast(apptB.startAt, referenceTime)) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Cannot swap appointments that are already in the past',
        null,
        400,
      );
    }
  }

  /**
   * Asserts that a staff member belongs to the same dealership as this appointment.
   */
  public static assertStaffDealership(
    appointment: { dealershipId: string | number },
    actor: ActorContext,
  ): void {
    if (actor.actorType === 'staff') {
      if (!actor.dealershipId || String(appointment.dealershipId) !== String(actor.dealershipId)) {
        throw new ForbiddenDomainException(
          'Staff member cannot modify appointments belonging to another dealership',
        );
      }
    }
  }

  /**
   * Instance method: checks whether this appointment is modifiable.
   */
  public isModifiable(): boolean {
    return Appointment.isModifiable(this.status);
  }

  /**
   * Instance method: checks whether this appointment scheduled start is in the past.
   */
  public isPast(referenceTime: Date = new Date()): boolean {
    return Appointment.isPast(this.startAt, referenceTime);
  }

  /**
   * Instance method: asserts this appointment is modifiable.
   */
  public assertModifiable(action: string = 'modify', referenceTime: Date = new Date()): void {
    Appointment.assertModifiable(this, action, referenceTime);
  }

  /**
   * Instance method: asserts staff belongs to the same dealership.
   */
  public assertStaffDealership(actor: ActorContext): void {
    Appointment.assertStaffDealership(this, actor);
  }

  /**
   * Domain method: transitions active appointment to CANCELLED (B6, E8).
   */
  public cancel(
    actor: ActorContext,
    reason: string | undefined,
    now: Date,
  ): AppointmentStatus {
    const isActive = (ACTIVE_STATUSES as readonly AppointmentStatus[]).includes(this.status);
    if (!isActive) {
      throw new InvalidStateTransitionException(
        `Cannot cancel appointment currently in ${this.status} status`,
      );
    }

    const fromStatus = this.status;
    this.status = AppointmentStatus.CANCELLED;
    this.cancelReason =
      reason?.trim() ||
      (actor.actorType === 'customer'
        ? 'Customer requested cancellation'
        : 'Cancelled by staff');
    this.cancelledAt = now;
    const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;
    this.cancelledBy = actorIdentifier;
    this.updated_by = actorIdentifier;

    return fromStatus;
  }
}
