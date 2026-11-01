import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseAuditEntity } from '@app/common';
import { Appointment } from './appointment.entity';

@Entity({ name: 'appointment_details' })
export class AppointmentDetail extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'uuid', name: 'appointment_id' })
  public appointmentId!: string;

  @Column({ type: 'bigint', name: 'service_type_id' })
  public serviceTypeId!: string;

  @Column({ type: 'varchar', length: 50 })
  public code!: string;

  @Column({ type: 'varchar', length: 255 })
  public name!: string;

  @Column({ type: 'int', name: 'duration_minutes' })
  public durationMinutes!: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  public price!: number;

  @Column({ type: 'int', name: 'sequence_order', default: 1 })
  public sequenceOrder!: number;

  @ManyToOne(() => Appointment, (appointment) => appointment.details, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'appointment_id' })
  public appointment!: Appointment;
}

// Backward-compatible alias
export { AppointmentDetail as AppointmentServiceItem };
