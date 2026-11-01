import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import * as crypto from 'crypto';
import {
  IdempotencyInProgressException,
  IdempotencyKeyReusedException,
} from '@app/common';
import { IdempotencyRepository } from '../repositories/idempotency.repository';

@Injectable()
export class IdempotencyService {
  public constructor(
    private readonly repo: IdempotencyRepository,
  ) {}

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
    const isFresh = await this.repo.insertInProgress(m, subject, key, hash);
    if (isFresh) {
      return null;
    }

    const existing = await this.repo.findByKey(m, subject, key);

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
    await this.repo.updateResponse(m, subject, key, response);
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
