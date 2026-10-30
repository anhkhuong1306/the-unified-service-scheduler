import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseAuditEntity } from '@app/common';
import { Vehicle } from '../vehicle/vehicle.entity';

@Entity({ name: 'customers' })
@Unique(['tenantId', 'identitySubject'])
export class Customer extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'uuid', name: 'identity_subject' })
  public identitySubject!: string;

  @Column({ type: 'varchar', length: 255 })
  public name!: string;

  @Column({ type: 'varchar', length: 255 })
  public email!: string;

  @Column({ type: 'varchar', length: 50 })
  public phone!: string;

  @OneToMany(() => Vehicle, (v) => v.customer)
  public vehicles!: Vehicle[];
}
