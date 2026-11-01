import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseAuditEntity } from '@app/common';

@Entity({ name: 'skills' })
@Unique(['tenantId', 'name'])
export class Skill extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'varchar', length: 100 })
  public name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  public description!: string | null;
}
