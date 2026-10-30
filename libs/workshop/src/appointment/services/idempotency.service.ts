import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import * as crypto from 'crypto';
import {
  IdempotencyInProgressException,
  IdempotencyKeyReusedException,
} from '@app/common';
import { IdempotencyKey } from '../idempotency-key.entity';

@Injectable()
export class IdempotencyService {
  /**
   * Begins idempotency processing inside transaction.
   * Returns cached response if replay, or null if fresh request.
   */
  public async begin(
    m: EntityManager,
    subject: string,
    key: string,
    hash: string,
  ): Promise<{ id: string } | null> {
    const inserted = await m.query<unknown[]>(
      `INSERT INTO idempotency_keys (subject, key, request_hash, status, expires_at)
       VALUES ($1, $2, $3, 'IN_PROGRESS', now() + interval '24 hours')
       ON CONFLICT (subject, key) DO UPDATE
         SET request_hash = EXCLUDED.request_hash,
             status = 'IN_PROGRESS',
             response = NULL,
             expires_at = EXCLUDED.expires_at
         WHERE idempotency_keys.expires_at < now()
       RETURNING 1`,
      [subject, key, hash],
    );

    if (inserted.length > 0) {
      return null; // Fresh request
    }

    const existing = await m.findOneOrFail(IdempotencyKey, {
      where: { subject, key },
    });

    if (existing.requestHash !== hash) {
      throw new IdempotencyKeyReusedException(
        'Idempotency key has already been used with a different request payload',
      );
    }

    if (existing.status !== 'COMPLETED' || !existing.response) {
      throw new IdempotencyInProgressException(
        'A request with the same Idempotency-Key is currently being processed',
      );
    }

    return existing.response as { id: string };
  }

  public async complete(
    m: EntityManager,
    subject: string,
    key: string,
    response: Record<string, unknown>,
  ): Promise<void> {
    await m.update(
      IdempotencyKey,
      { subject, key },
      { status: 'COMPLETED', response: response as any },
    );
  }
}

/**
 * Deterministic JSON payload hasher (alphabetically sorts object keys).
 */
export function hashRequest(payload: unknown): string {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, stable(x)]),
          )
        : v;

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(payload)))
    .digest('hex');
}
