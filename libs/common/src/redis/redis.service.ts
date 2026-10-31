import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Safe wrapper around ioredis: all commands wrap execution in try/catch and return defaults
 * when Redis is unavailable, allowing callers to gracefully degrade to database queries.
 * Connection establishment and lifecycle management (connect/quit) are handled in RedisModule.
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  public constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  /** Connection status determined directly by ioredis client state. */
  public isAvailable(): boolean {
    return this.client.status === 'ready';
  }

  /** Returns client if connection is ready, otherwise null. */
  private get ready(): Redis | null {
    return this.client.status === 'ready' ? this.client : null;
  }

  private logError(op: string, key: string, err: unknown, field?: string): void {
    const msg = err instanceof Error ? err.message : String(err);
    const where = field !== undefined ? `key '${key}', field '${field}'` : `key '${key}'`;
    this.logger.warn(`Redis ${op} error on ${where}: ${msg}`);
  }

  /** Always JSON.stringify when writing to ensure symmetric JSON.parse on reads. */
  private serialize(value: unknown): string {
    return JSON.stringify(value);
  }

  private deserialize<T>(raw: string): T {
    return JSON.parse(raw) as T;
  }

  // ---------------------------------------------------------------- String

  public async get<T>(key: string): Promise<T | null> {
    const client = this.ready;
    if (!client) return null;
    try {
      const data = await client.get(key);
      return data === null ? null : this.deserialize<T>(data);
    } catch (err: unknown) {
      this.logError('GET', key, err);
      return null;
    }
  }

  public async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = this.ready;
    if (!client) return;
    try {
      const serialized = this.serialize(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await client.set(key, serialized, 'EX', ttlSeconds); // atomic set with TTL
      } else {
        await client.set(key, serialized);
      }
    } catch (err: unknown) {
      this.logError('SET', key, err);
    }
  }

  public async exists(key: string): Promise<boolean> {
    const client = this.ready;
    if (!client) return false;
    try {
      return (await client.exists(key)) === 1;
    } catch (err: unknown) {
      this.logError('EXISTS', key, err);
      return false;
    }
  }

  public async incr(key: string, ttlSeconds?: number): Promise<number | null> {
    const client = this.ready;
    if (!client) return null;
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        // EXPIRE ... NX requires Redis >= 7.0.
        const results = await client.multi().incr(key).expire(key, ttlSeconds, 'NX').exec();
        const first = results?.[0];
        if (!first || first[0]) throw first?.[0] ?? new Error('INCR failed');
        return Number(first[1]);
      }
      return await client.incr(key);
    } catch (err: unknown) {
      this.logError('INCR', key, err);
      return null;
    }
  }

  // ------------------------------------------------------------------ Hash

  /** Reads a single hash field and parses it from JSON. */
  public async hget<T>(key: string, field: string): Promise<T | null> {
    const client = this.ready;
    if (!client) return null;
    try {
      const data = await client.hget(key, field);
      // Only null represents a cache miss; empty strings represent valid values.
      return data === null ? null : this.deserialize<T>(data);
    } catch (err: unknown) {
      this.logError('HGET', key, err, field);
      return null;
    }
  }

  /**
   * Writes a single field to a hash as JSON. When TTL is provided, HSET + EXPIRE execute
   * atomically in MULTI to ensure keys are never left without an expiration.
   */
  public async hset(key: string, field: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = this.ready;
    if (!client) return;
    try {
      const tx = client.multi().hset(key, field, this.serialize(value));
      if (ttlSeconds && ttlSeconds > 0) {
        tx.expire(key, ttlSeconds);
      }
      await this.execOrThrow(tx);
    } catch (err: unknown) {
      this.logError('HSET', key, err, field);
    }
  }

  /**
   * Writes multiple fields simultaneously using HSET with an object payload (HMSET is deprecated).
   * Method signature retains hmset for backward compatibility with existing callers.
   */
  public async hmset(key: string, data: Record<string, unknown>, ttlSeconds?: number): Promise<void> {
    const client = this.ready;
    if (!client || Object.keys(data).length === 0) return;
    try {
      const payload: Record<string, string> = {};
      for (const [field, val] of Object.entries(data)) {
        payload[field] = this.serialize(val);
      }
      const tx = client.multi().hset(key, payload);
      if (ttlSeconds && ttlSeconds > 0) {
        tx.expire(key, ttlSeconds);
      }
      await this.execOrThrow(tx);
    } catch (err: unknown) {
      this.logError('HMSET', key, err);
    }
  }

  /**
   * Reads all fields from a hash and parses each value as JSON.
   * Fields that fail parsing are skipped and logged rather than returning raw strings.
   */
  public async hgetall<T>(key: string): Promise<Record<string, T>> {
    const client = this.ready;
    if (!client) return {};
    try {
      const raw = await client.hgetall(key);
      const result: Record<string, T> = {};
      for (const [field, valueStr] of Object.entries(raw)) {
        try {
          result[field] = this.deserialize<T>(valueStr);
        } catch (err: unknown) {
          this.logError('HGETALL(parse)', key, err, field);
        }
      }
      return result;
    } catch (err: unknown) {
      this.logError('HGETALL', key, err);
      return {};
    }
  }

  public async hdel(key: string, ...fields: string[]): Promise<number> {
    const client = this.ready;
    if (!client || fields.length === 0) return 0;
    try {
      return await client.hdel(key, ...fields);
    } catch (err: unknown) {
      this.logError('HDEL', key, err);
      return 0;
    }
  }

  // ------------------------------------------------------------------- Key

  public async del(key: string): Promise<number> {
    const client = this.ready;
    if (!client) return 0;
    try {
      return await client.del(key);
    } catch (err: unknown) {
      this.logError('DEL', key, err);
      return 0;
    }
  }

  public async expire(key: string, seconds: number): Promise<boolean> {
    const client = this.ready;
    if (!client) return false;
    try {
      return (await client.expire(key, seconds)) === 1;
    } catch (err: unknown) {
      this.logError('EXPIRE', key, err);
      return false;
    }
  }

  /**
   * Deletes keys matching a pattern via SCAN stream without blocking the Redis event loop.
   * Returns total count of unlinked keys.
   */
  public async delByPattern(pattern: string): Promise<number> {
    const client = this.ready;
    if (!client) return 0;
    let deleted = 0;
    try {
      const stream = client.scanStream({ match: pattern, count: 200 });
      for await (const keys of stream as AsyncIterable<string[]>) {
        if (keys.length > 0) {
          deleted += await client.unlink(...keys);
        }
      }
    } catch (err: unknown) {
      this.logError('SCAN/UNLINK', pattern, err);
    }
    return deleted;
  }

  // --------------------------------------------------------------- Helpers

  /** Executes MULTI pipeline and throws if any sub-command reported an error. */
  private async execOrThrow(tx: ReturnType<Redis['multi']>): Promise<void> {
    const results = await tx.exec();
    if (!results) {
      throw new Error('Transaction aborted');
    }
    for (const [err] of results) {
      if (err) throw err;
    }
  }
}
