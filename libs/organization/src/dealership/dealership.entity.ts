import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseAuditEntity } from '@app/common';

@Entity({ name: 'dealerships' })
export class Dealership extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'varchar', length: 255 })
  public name!: string;

  @Column({ type: 'varchar', length: 500 })
  public address!: string;

  @Column({ type: 'varchar', length: 100, default: 'Asia/Ho_Chi_Minh' })
  public timezone!: string;
}
