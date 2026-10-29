import {
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Base TypeORM entity providing audit columns (`created_at`, `created_by`, `updated_at`, `updated_by`)
 * as defined in SYSTEM_DESIGN.md §5.
 */
export abstract class BaseAuditEntity {
  /** Timestamp when the record was created (UTC). */
  @CreateDateColumn({
    type: 'timestamptz',
    name: 'created_at',
  })
  public created_at!: Date;

  /** JWT `sub` of the acting customer or staff member; `null` for system actions. */
  @Column({
    type: 'uuid',
    name: 'created_by',
    nullable: true,
    default: null,
  })
  public created_by!: string | null;

  /** Timestamp when the record was last updated (UTC). */
  @UpdateDateColumn({
    type: 'timestamptz',
    name: 'updated_at',
  })
  public updated_at!: Date;

  /** JWT `sub` of the acting customer or staff member; `null` for system actions. */
  @Column({
    type: 'uuid',
    name: 'updated_by',
    nullable: true,
    default: null,
  })
  public updated_by!: string | null;
}
