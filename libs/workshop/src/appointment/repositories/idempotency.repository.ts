import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { IdempotencyKey } from '../entities/idempotency-key.entity';

@Injectable()
export class IdempotencyRepository {
  public constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repo: Repository<IdempotencyKey>,
  ) {}

  public async insertInProgress(
    m: EntityManager,
    subject: string,
    key: string,
    hash: string,
  ): Promise<boolean> {
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
    return inserted.length > 0;
  }

  public async findByKey(
    m: EntityManager,
    subject: string,
    key: string,
  ): Promise<IdempotencyKey> {
    return m.findOneOrFail(IdempotencyKey, {
      where: { subject, key },
    });
  }

  public async updateResponse(
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
