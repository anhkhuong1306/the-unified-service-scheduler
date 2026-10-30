import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'appointment_events' })
export class AppointmentEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  public id!: string;

  @Column({ type: 'uuid', name: 'appointment_id' })
  public appointmentId!: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'from_status' })
  public fromStatus!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'to_status' })
  public toStatus!: string;

  @Column({ type: 'uuid', nullable: true, name: 'actor_subject' })
  public actorSubject!: string | null;

  @Column({ type: 'varchar', length: 50, name: 'actor_type', default: 'customer' })
  public actorType!: 'customer' | 'staff' | 'system' | 'anonymous';

  @Column({ type: 'jsonb', nullable: true })
  public changes!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  public createdAt!: Date;
}
