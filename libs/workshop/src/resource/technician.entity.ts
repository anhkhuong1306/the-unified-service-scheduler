import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { BaseAuditEntity } from '@app/common';
import { TechnicianSkill } from './technician-skill.entity';

@Entity({ name: 'technicians' })
export class Technician extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'bigint', name: 'dealership_id' })
  public dealershipId!: string;

  @Column({ type: 'varchar', length: 255 })
  public name!: string;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  public isActive!: boolean;

  @OneToMany(() => TechnicianSkill, (ts) => ts.technician)
  public technicianSkills!: TechnicianSkill[];
}
