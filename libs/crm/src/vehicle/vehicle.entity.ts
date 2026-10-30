import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BaseAuditEntity } from '@app/common';
import { Customer } from '../customer/customer.entity';

@Entity({ name: 'vehicles' })
@Unique(['tenantId', 'vin'])
export class Vehicle extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'bigint', name: 'customer_id' })
  public customerId!: string;

  @Column({ type: 'varchar', length: 17 })
  public vin!: string;

  @Column({ type: 'varchar', length: 20, name: 'license_plate' })
  public licensePlate!: string;

  @Column({ type: 'varchar', length: 100 })
  public make!: string;

  @Column({ type: 'varchar', length: 100 })
  public model!: string;

  @Column({ type: 'int' })
  public year!: number;

  @ManyToOne(() => Customer, (c) => c.vehicles, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  public customer!: Customer;
}
