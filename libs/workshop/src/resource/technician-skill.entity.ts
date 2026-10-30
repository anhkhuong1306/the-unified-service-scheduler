import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BaseAuditEntity } from '@app/common';
import { Skill } from '../service-catalog/skill.entity';
import { Technician } from './technician.entity';

@Entity({ name: 'technician_skills' })
@Unique(['technicianId', 'skillId'])
export class TechnicianSkill extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'bigint', name: 'technician_id' })
  public technicianId!: string;

  @Column({ type: 'bigint', name: 'skill_id' })
  public skillId!: string;

  @ManyToOne(() => Technician, (t) => t.technicianSkills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'technician_id' })
  public technician!: Technician;

  @ManyToOne(() => Skill, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skill_id' })
  public skill!: Skill;
}
