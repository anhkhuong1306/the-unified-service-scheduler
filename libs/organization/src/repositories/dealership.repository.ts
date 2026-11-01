import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CursorPaginationHelper,
  CursorPaginationMeta,
  OffsetPaginationHelper,
  OffsetPaginationMeta,
} , DEFAULT_TENANT_ID } from '@app/common';
import { Dealership } from '../entities/dealership.entity';
import { DealershipCursorParams, DealershipFilterParams, FindDealershipByIdParams } from '../types/dealership-query.params';

@Injectable()
export class DealershipRepository {
  public constructor(
    @InjectRepository(Dealership)
    private readonly repo: Repository<Dealership>,
  ) {}

  public async paginateCursor(
    params: DealershipCursorParams,
  ): Promise<{ items: Dealership[]; meta: CursorPaginationMeta }> {
    const qb = this.repo
      .createQueryBuilder('dealership')
      .where('dealership.tenant_id = :tenantId', { tenantId: params.tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(
      qb,
      { cursor: params.cursor, limit: params.limit },
      { sortField: 'id', sortOrder: 'ASC' },
    );
  }

  public async paginateOffset(
    params: DealershipFilterParams,
  ): Promise<{ items: Dealership[]; meta: OffsetPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const qb = this.repo
      .createQueryBuilder('dealership')
      .where('dealership.tenant_id = :tenantId', { tenantId });

    if (params.code) {
      qb.andWhere('dealership.code ILIKE :code', {
        code: `%${params.code.trim()}%`,
      });
    }

    if (params.name) {
      qb.andWhere('dealership.name ILIKE :name', {
        name: `%${params.name.trim()}%`,
      });
    }

    return OffsetPaginationHelper.paginateQueryBuilder(
      qb,
      { page: params.page, limit: params.limit },
      { defaultSortField: 'id', defaultSortOrder: 'ASC' },
    );
  }

  public async findById(params: FindDealershipByIdParams): Promise<Dealership | null> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    return this.repo.findOne({
      where: { id: params.id, tenantId },
    });
  }

  public async findAll(tenantId: string = DEFAULT_TENANT_ID): Promise<Dealership[]> {
    return this.repo.find({
      where: { tenantId },
      order: { id: 'ASC' },
    });
  }
}
