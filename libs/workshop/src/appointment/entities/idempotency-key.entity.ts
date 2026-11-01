import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKey {
  @PrimaryColumn({ type: 'uuid' })
  public subject!: string;

  @PrimaryColumn({ type: 'varchar', length: 255 })
  public key!: string;

  @Column({ type: 'varchar', length: 64, name: 'request_hash' })
  public requestHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'IN_PROGRESS' })
  public status!: 'IN_PROGRESS' | 'COMPLETED';

  @Column({ type: 'timestamptz', name: 'locked_until', nullable: true })
  public lockedUntil!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  public response!: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  public expiresAt!: Date;
}
