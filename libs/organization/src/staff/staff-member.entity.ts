import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseAuditEntity } from '@app/common';

@Entity({ name: 'staff_members' })
@Unique(['tenantId', 'identitySubject'])
export class StaffMember extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'bigint', name: 'dealership_id' })
  public dealershipId!: string;

  @Column({ type: 'uuid', name: 'identity_subject' })
  public identitySubject!: string;

  @Column({ type: 'varchar', length: 255 })
  public name!: string;
}
