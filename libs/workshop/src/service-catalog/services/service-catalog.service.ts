import { Injectable } from '@nestjs/common';
import {
  CursorPaginationDto,
  CursorPaginationMeta,
  OffsetPaginationMeta,
} from '@app/common';
import { ServiceType } from '../entities/service-type.entity';
import { ServiceCatalogRepository } from '../repositories/service-catalog.repository';
import { ServiceTypeFilterParams } from '../types/service-catalog-query.params';

@Injectable()
export class ServiceCatalogService {
  public constructor(
    private readonly catalogRepo: ServiceCatalogRepository,
  ) {}

  public async listServiceTypes(tenantId: string = '1'): Promise<ServiceType[]> {
    const result = await this.catalogRepo.paginateOffset({ tenantId, page: 1, limit: 1000 });
    return result.items;
  }

  public async listServiceTypesPaginated(
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: ServiceType[]; meta: CursorPaginationMeta }> {
    return this.catalogRepo.paginateCursor({
      tenantId,
      cursor: cursorDto.cursor,
      limit: cursorDto.limit,
    });
  }

  public async listServiceTypesOffsetPaginated(
    dtoOrParams: ServiceTypeFilterParams,
    context?: { tenantId?: string },
  ): Promise<{ items: ServiceType[]; meta: OffsetPaginationMeta }> {
    const tenantId = context?.tenantId ?? dtoOrParams.tenantId ?? '1';
    return this.catalogRepo.paginateOffset({
      tenantId,
      code: dtoOrParams.code,
      name: dtoOrParams.name,
      page: dtoOrParams.page,
      limit: dtoOrParams.limit,
    });
  }

  public async findById(id: string, tenantId: string = '1'): Promise<ServiceType | null> {
    return this.catalogRepo.findById(id, tenantId);
  }
}
