import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { ServiceType } from '../entities/service-type.entity';
import {
  CursorPaginationHelper,
  CursorPaginationMeta,
  OffsetPaginationHelper,
  OffsetPaginationMeta,
  ResourceNotFoundException,
  DEFAULT_TENANT_ID,
} from '@app/common';
import { ServiceTypeCursorParams, ServiceTypeFilterParams } from '../types/service-catalog-query.params';

@Injectable()
export class ServiceTypeRepository {
  public constructor(
    @InjectRepository(ServiceType)
    private readonly repo: Repository<ServiceType>,
  ) {}

  public async paginateCursor(
    params: ServiceTypeCursorParams,
  ): Promise<{ items: ServiceType[]; meta: CursorPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const qb = this.repo
      .createQueryBuilder('service_type')
      .where('service_type.tenantId = :tenantId', { tenantId })
      .orderBy('service_type.id', 'ASC');

    return CursorPaginationHelper.paginateQueryBuilder(
      qb,
      { cursor: params.cursor, limit: params.limit },
      { sortField: 'id', sortOrder: 'ASC' },
    );
  }

  public async paginateOffset(
    params: ServiceTypeFilterParams,
  ): Promise<{ items: ServiceType[]; meta: OffsetPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const qb = this.repo
      .createQueryBuilder('service_type')
      .where('service_type.tenantId = :tenantId', { tenantId })
      .orderBy('service_type.id', 'ASC');

    if (params.code) {
      qb.andWhere('service_type.code ILIKE :code', {
        code: `%${params.code.trim()}%`,
      });
    }

    if (params.name) {
      qb.andWhere('service_type.name ILIKE :name', {
        name: `%${params.name.trim()}%`,
      });
    }

    return OffsetPaginationHelper.paginateQueryBuilder(
      qb,
      { page: params.page, limit: params.limit },
      { defaultSortField: 'id', defaultSortOrder: 'ASC' },
    );
  }

  public async findById(
    id: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType | null> {
    const repository = manager ? manager.getRepository(ServiceType) : this.repo;
    return repository.findOne({
      where: { id, tenantId },
    });
  }

  public async getByIdOrFail(
    id: string,
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType> {
    const st = await this.findById(id, tenantId, manager);
    if (!st) {
      throw new ResourceNotFoundException(`Service type ${id} not found`);
    }
    return st;
  }

  public async findByIds(
    ids: string[],
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType[]> {
    if (!ids || ids.length === 0) {
      return [];
    }
    const repository = manager ? manager.getRepository(ServiceType) : this.repo;
    return repository.find({
      where: { id: In(ids), tenantId },
    });
  }

  public async getByIdsOrFail(
    ids: string[],
    tenantId: string = DEFAULT_TENANT_ID,
    manager?: EntityManager,
  ): Promise<ServiceType[]> {
    return Promise.all(ids.map((id) => this.getByIdOrFail(id, tenantId, manager)));
  }

  public async findAll(tenantId: string = DEFAULT_TENANT_ID): Promise<ServiceType[]> {
    return this.repo.find({
      where: { tenantId },
      order: { id: 'ASC' },
    });
  }
}
