import { SelectQueryBuilder } from 'typeorm';
import { OffsetPaginationDto } from './offset-pagination.dto';
import { OffsetPaginationMeta } from './offset-paginated-response.dto';

export class OffsetPaginationHelper {
  public static async paginateQueryBuilder<T extends Record<string, any>>(
    qb: SelectQueryBuilder<T>,
    dto: OffsetPaginationDto = {},
    options: {
      defaultSortField?: string;
      defaultSortOrder?: 'ASC' | 'DESC';
    } = {},
  ): Promise<{ items: T[]; meta: OffsetPaginationMeta }> {
    const page = Math.max(Number(dto.page) || 1, 1);
    const limit = Math.min(Math.max(Number(dto.limit) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const alias = qb.alias;
    if (options.defaultSortField && qb.expressionMap.orderBys && Object.keys(qb.expressionMap.orderBys).length === 0) {
      qb.orderBy(`${alias}.${options.defaultSortField}`, options.defaultSortOrder ?? 'ASC');
    }

    qb.skip(offset).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  public static paginateArray<T>(
    array: readonly T[],
    dto: OffsetPaginationDto = {},
  ): { items: T[]; meta: OffsetPaginationMeta } {
    const page = Math.max(Number(dto.page) || 1, 1);
    const limit = Math.min(Math.max(Number(dto.limit) || 20, 1), 100);
    const total = array.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const offset = (page - 1) * limit;
    const items = array.slice(offset, offset + limit);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }
}
