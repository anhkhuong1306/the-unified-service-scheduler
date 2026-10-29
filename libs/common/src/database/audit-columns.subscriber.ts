import { Injectable } from '@nestjs/common';
import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { RequestContextService } from '../context/request-context.service';

export interface AuditableEntityRecord {
  created_by?: string | null;
  updated_by?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: Date | null;
  cancel_reason?: string | null;
  [key: string]: unknown;
}

/**
 * TypeORM subscriber and static helper that automatically populates `created_by`, `updated_by`,
 * and `cancelled_by` from the active `AsyncLocalStorage` context (§5 of SYSTEM_DESIGN.md).
 *
 * System actions (`actorType === 'system'` or unauthenticated contexts) store `null`.
 */
@EventSubscriber()
@Injectable()
export class AuditColumnsSubscriber implements EntitySubscriberInterface {
  /**
   * Resolve the acting JWT subject (`sub`), returning `null` when executed by a system actor.
   */
  public static resolveActorSub(): string | null {
    if (RequestContextService.isSystemActor()) {
      return null;
    }

    return RequestContextService.getActorSub();
  }

  /**
   * Populate `created_by` (if not already set) and `updated_by` on entity creation.
   */
  public static applyAuditOnCreate(
    entity: AuditableEntityRecord | undefined | null,
  ): void {
    if (!entity || typeof entity !== 'object') {
      return;
    }

    const actorSub = AuditColumnsSubscriber.resolveActorSub();

    if (
      entity.created_by === undefined ||
      entity.created_by === null ||
      entity.created_by === ''
    ) {
      entity.created_by = actorSub;
    }

    entity.updated_by = actorSub;
  }

  /**
   * Populate `updated_by` on entity update.
   */
  public static applyAuditOnUpdate(
    entity: AuditableEntityRecord | undefined | null,
  ): void {
    if (!entity || typeof entity !== 'object') {
      return;
    }

    entity.updated_by = AuditColumnsSubscriber.resolveActorSub();
  }

  /**
   * Populate soft-cancellation audit fields (`cancelled_by`, `cancelled_at`, `cancel_reason`, `updated_by`).
   */
  public static markCancelled(
    entity: AuditableEntityRecord,
    reason: string | null = null,
    cancelledAt: Date = new Date(),
  ): void {
    if (!entity || typeof entity !== 'object') {
      return;
    }

    const actorSub = AuditColumnsSubscriber.resolveActorSub();

    entity.cancelled_by = actorSub;
    entity.cancelled_at = cancelledAt;
    entity.cancel_reason = reason;
    entity.updated_by = actorSub;
  }

  public beforeInsert(event: InsertEvent<AuditableEntityRecord>): void {
    AuditColumnsSubscriber.applyAuditOnCreate(event.entity);
  }

  public beforeUpdate(event: UpdateEvent<AuditableEntityRecord>): void {
    AuditColumnsSubscriber.applyAuditOnUpdate(event.entity);
  }
}
