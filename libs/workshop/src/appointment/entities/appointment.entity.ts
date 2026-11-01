import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { BaseAuditEntity, InvalidStateTransitionException } from '@app/common';
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
