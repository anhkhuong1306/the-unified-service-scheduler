import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseAuditEntity } from '@app/common';

@Entity({ name: 'service_bays' })
@Unique(['dealershipId', 'code'])
export class ServiceBay extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'bigint', name: 'dealership_id' })
  public dealershipId!: string;

  @Column({ type: 'varchar', length: 50 })
  public code!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  public isActive!: boolean;
}
