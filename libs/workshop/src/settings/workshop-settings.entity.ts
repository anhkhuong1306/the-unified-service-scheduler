import { Column, Entity, PrimaryColumn } from 'typeorm';
import { BaseAuditEntity } from '@app/common';

@Entity({ name: 'workshop_settings' })
export class WorkshopSettings extends BaseAuditEntity {
  @PrimaryColumn({ type: 'bigint', name: 'dealership_id' })
  public dealershipId!: string;

  @Column({ type: 'bigint', name: 'tenant_id' })
  public tenantId!: string;

  @Column({ type: 'varchar', length: 100, default: 'Asia/Ho_Chi_Minh' })
  public timezone!: string;

  @Column({ type: 'time', name: 'opens_at', default: '08:00:00' })
  public opensAt!: string;

  @Column({ type: 'time', name: 'closes_at', default: '18:00:00' })
  public closesAt!: string;

  @Column({ type: 'int', name: 'slot_minutes', default: 30 })
  public slotMinutes!: number;

  @Column({ type: 'int', name: 'buffer_minutes', default: 15 })
  public bufferMinutes!: number;

  @Column({ type: 'int', name: 'grace_minutes', default: 15 })
  public graceMinutes!: number;

  @Column({ type: 'int', name: 'lead_time_minutes', default: 60 })
  public leadTimeMinutes!: number;

  @Column({ type: 'int', name: 'horizon_days', default: 30 })
  public horizonDays!: number;

  @Column({ type: 'int', name: 'cancellation_cutoff_minutes', default: 120 })
  public cancellationCutoffMinutes!: number;

  @Column({ type: 'boolean', name: 'requires_approval', default: false })
  public requiresApproval!: boolean;

  @Column({ type: 'int', name: 'max_active_per_customer', default: 3 })
  public maxActivePerCustomer!: number;
}
