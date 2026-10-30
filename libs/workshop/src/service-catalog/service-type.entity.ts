import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BaseAuditEntity } from '@app/common';
import { Skill } from './skill.entity';

@Entity({ name: 'service_types' })
@Unique(['tenantId', 'code'])
export class ServiceType extends BaseAuditEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'bigint', name: 'tenant_id', default: 1 })
  public tenantId!: string;

  @Column({ type: 'bigint', name: 'skill_id', nullable: true })
  public skillId!: string | null;

  @Column({ type: 'varchar', length: 50 })
  public code!: string;

  @Column({ type: 'varchar', length: 255 })
  public name!: string;

  @Column({ type: 'int', name: 'duration_minutes' })
  public durationMinutes!: number;

  @ManyToOne(() => Skill, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'skill_id' })
  public skill!: Skill | null;
}
