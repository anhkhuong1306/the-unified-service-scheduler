import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CursorPaginationHelper,
  CursorPaginationMeta,
  OffsetPaginationHelper,
  OffsetPaginationMeta,
} from '@app/common';
import { ServiceType } from '../entities/service-type.entity';
import { ServiceTypeCursorParams, ServiceTypeFilterParams } from '../types/service-catalog-query.params';

@Injectable()
export class ServiceCatalogRepository {
  public constructor(
    @InjectRepository(ServiceType)
    private readonly repo: Repository<ServiceType>,
  ) {}

  public async findById(id: string, tenantId: string = '1'): Promise<ServiceType | null> {
    return this.repo.findOne({
      where: { id, tenantId },
      relations: ['skill'],
    });
  }

  public async findByIds(ids: string[], tenantId: string = '1'): Promise<ServiceType[]> {
    if (ids.length === 0) {
      return [];
    }
    return this.repo.find({
      where: { id: In(ids), tenantId },
      relations: ['skill'],
    });
  }

  public async paginateCursor(
    params: ServiceTypeCursorParams,
  ): Promise<{ items: ServiceType[]; meta: CursorPaginationMeta }> {
    const tenantId = params.tenantId ?? '1';
    const qb = this.repo
      .createQueryBuilder('serviceType')
      .leftJoinAndSelect('serviceType.skill', 'skill')
      .where('serviceType.tenant_id = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(
      qb,
      { cursor: params.cursor, limit: params.limit },
      { sortField: 'id', sortOrder: 'ASC' },
    );
  }

  public async paginateOffset(
    params: ServiceTypeFilterParams,
  ): Promise<{ items: ServiceType[]; meta: OffsetPaginationMeta }> {
    const tenantId = params.tenantId ?? '1';
    const qb = this.repo
      .createQueryBuilder('serviceType')
      .leftJoinAndSelect('serviceType.skill', 'skill')
      .where('serviceType.tenant_id = :tenantId', { tenantId });

    if (params.code) {
      qb.andWhere('serviceType.code ILIKE :code', {
        code: `%${params.code.trim()}%`,
      });
    }

    if (params.name) {
      qb.andWhere('serviceType.name ILIKE :name', {
        name: `%${params.name.trim()}%`,
      });
    }

    return OffsetPaginationHelper.paginateQueryBuilder(
      qb,
      { page: params.page, limit: params.limit },
      { defaultSortField: 'id', defaultSortOrder: 'ASC' },
    );
  }
}
