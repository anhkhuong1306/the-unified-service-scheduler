import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CursorPaginationHelper,
  CursorPaginationMeta,
  OffsetPaginationHelper,
  OffsetPaginationMeta,
  DEFAULT_TENANT_ID,
} from '@app/common';
import { Customer } from '../entities/customer.entity';
import { CustomerCursorParams, CustomerFilterParams } from '../types/crm-query.params';

@Injectable()
export class CustomerRepository {
  public constructor(
    @InjectRepository(Customer)
    private readonly repo: Repository<Customer>,
  ) {}

  public async findBySubject(identitySubject: string, tenantId: string = DEFAULT_TENANT_ID): Promise<Customer | null> {
    return this.repo.findOne({
      where: { identitySubject, tenantId },
    });
  }

  public async findById(id: string, tenantId: string = DEFAULT_TENANT_ID): Promise<Customer | null> {
    return this.repo.findOne({
      where: { id, tenantId },
    });
  }

  public async paginateCursor(
    params: CustomerCursorParams,
  ): Promise<{ items: Customer[]; meta: CursorPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const qb = this.repo
      .createQueryBuilder('customer')
      .where('customer.tenant_id = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(
      qb,
      { cursor: params.cursor, limit: params.limit },
      { sortField: 'id', sortOrder: 'ASC' },
    );
  }

  public async paginateOffset(
    params: CustomerFilterParams,
  ): Promise<{ items: Customer[]; meta: OffsetPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const qb = this.repo
      .createQueryBuilder('customer')
      .where('customer.tenant_id = :tenantId', { tenantId });

    if (params.code) {
      qb.andWhere('customer.code ILIKE :code', {
        code: `%${params.code.trim()}%`,
      });
    }

    if (params.name) {
      qb.andWhere('customer.name ILIKE :name', {
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
