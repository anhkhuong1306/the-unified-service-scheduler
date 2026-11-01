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

  /** Identifier (code, username, or sub) of the acting customer or staff member; `null` for system actions. */
  @Column({
    type: 'varchar',
    length: 100,
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

  /** Identifier (code, username, or sub) of the acting customer or staff member; `null` for system actions. */
  @Column({
    type: 'varchar',
    length: 100,
    name: 'updated_by',
    nullable: true,
    default: null,
  })
  public updated_by!: string | null;

  public get createdBy(): string | null {
    return this.created_by;
  }

  public set createdBy(value: string | null) {
    this.created_by = value;
  }

  public get updatedBy(): string | null {
    return this.updated_by;
  }

  public set updatedBy(value: string | null) {
    this.updated_by = value;
  }
}
