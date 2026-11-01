import { BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { CursorPaginationDto } from './cursor-pagination.dto';
import { CursorPaginationMeta } from './paginated-response.dto';

export interface CursorPayload {
  id: string;
  sortValue?: string | number;
  [key: string]: unknown;
}

export class CursorPaginationHelper {
  public static encode(payload: CursorPayload): string {
    const json = JSON.stringify(payload);
    return Buffer.from(json, 'utf8').toString('base64url');
  }

  public static decode(cursor: string): CursorPayload {
    try {
      const json = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as CursorPayload;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') {
        throw new Error('Invalid cursor payload structure');
      }
      return parsed;
    } catch {
      throw new BadRequestException('Invalid pagination cursor');
    }
  }

  /**
   * Paginates a TypeORM SelectQueryBuilder using cursor-based seeking.
   */
  public static async paginateQueryBuilder<T extends Record<string, any>>(
    qb: SelectQueryBuilder<T>,
    cursorDto: CursorPaginationDto,
    options: {
      sortField?: string;
      sortOrder?: 'ASC' | 'DESC';
      idField?: string;
      idType?: 'string' | 'number' | 'uuid';
    } = {},
  ): Promise<{ items: T[]; meta: CursorPaginationMeta }> {
    const limit = Math.min(Math.max(Number(cursorDto.limit) || 20, 1), 100);
    const sortField = options.sortField ?? 'id';
    const sortOrder = options.sortOrder ?? 'ASC';
    const idField = options.idField ?? 'id';
    const alias = qb.alias;

    if (cursorDto.cursor) {
      const decoded = this.decode(cursorDto.cursor);
      const operator = sortOrder === 'ASC' ? '>' : '<';

      if (options.idType === 'uuid') {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(decoded.id)) {
          throw new BadRequestException('Invalid cursor format: ID must be a valid UUID');
        }
      }

      if (sortField === idField) {
        qb.andWhere(`${alias}.${idField} ${operator} :cursorId`, {
          cursorId: decoded.id,
        });
      } else {
        // Multi-column cursor: (sortField, idField)
        const sortVal = decoded.sortValue ?? decoded.id;
        qb.andWhere(
          `(${alias}.${sortField} ${operator} :cursorSortVal OR (${alias}.${sortField} = :cursorSortVal AND ${alias}.${idField} ${operator} :cursorId))`,
          {
            cursorSortVal: sortVal,
            cursorId: decoded.id,
          },
        );
      }
    }

    if (sortField !== idField) {
      qb.orderBy(`${alias}.${sortField}`, sortOrder);
      qb.addOrderBy(`${alias}.${idField}`, sortOrder);
    } else {
      qb.orderBy(`${alias}.${idField}`, sortOrder);
    }

    // Fetch limit + 1 to detect hasMore without a separate COUNT(*) query
    qb.take(limit + 1);

    try {
      const results = await qb.getMany();
      const hasMore = results.length > limit;
      const items = hasMore ? results.slice(0, limit) : results;

      let nextCursor: string | null = null;
      if (hasMore && items.length > 0) {
        const lastItem = items[items.length - 1];
        const lastId = String(lastItem[idField]);
        const lastSortVal = sortField !== idField ? lastItem[sortField] : undefined;
        nextCursor = this.encode({
          id: lastId,
          sortValue: lastSortVal,
        });
      }

      return {
        items,
        meta: {
          limit,
          nextCursor,
          hasMore,
        },
      };
    } catch (error: any) {
      if (error?.code === '22P02' || error?.message?.includes('invalid input syntax for type uuid')) {
        throw new BadRequestException('Invalid cursor format: ID must be a valid UUID');
      }
      throw error;
    }
  }

  /**
   * Paginates an in-memory array using cursor seeking (ideal for cached datasets).
   */
  public static paginateArray<T extends Record<string, any>>(
    all: T[],
    cursorDto: CursorPaginationDto,
    getId: (item: T) => string = (item) => String(item.id),
  ): { items: T[]; meta: CursorPaginationMeta } {
    const limit = Math.min(Math.max(Number(cursorDto.limit) || 20, 1), 100);
    let startIndex = 0;

    if (cursorDto.cursor) {
      const decoded = this.decode(cursorDto.cursor);
      const foundIdx = all.findIndex((item) => getId(item) === decoded.id);
      if (foundIdx !== -1) {
        startIndex = foundIdx + 1;
      }
    }

    const sliced = all.slice(startIndex, startIndex + limit + 1);
    const hasMore = sliced.length > limit;
    const items = hasMore ? sliced.slice(0, limit) : sliced;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = this.encode({ id: getId(lastItem) });
    }

    return {
      items,
      meta: {
        limit,
        nextCursor,
        hasMore,
        total: all.length,
      },
    };
  }
}
