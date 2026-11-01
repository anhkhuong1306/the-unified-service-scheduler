import { Injectable } from '@nestjs/common';
import {
  CursorPaginationDto,
  CursorPaginationMeta,
  OffsetPaginationMeta,
} from '@app/common';
import { Dealership } from '../entities/dealership.entity';
import { DealershipRepository } from '../repositories/dealership.repository';
import { DealershipFilterParams, FindDealershipByIdParams } from '../types/dealership-query.params';

@Injectable()
export class DealershipService {
  public constructor(
    private readonly dealershipRepo: DealershipRepository,
  ) {}

  public async listDealerships(tenantId: string = '1'): Promise<Dealership[]> {
    const result = await this.dealershipRepo.paginateOffset({ tenantId, page: 1, limit: 1000 });
    return result.items;
  }

  public async listDealershipsPaginated(
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: Dealership[]; meta: CursorPaginationMeta }> {
    return this.dealershipRepo.paginateCursor({
      tenantId,
      cursor: cursorDto.cursor,
      limit: cursorDto.limit,
    });
  }

  public async listDealershipsOffsetPaginated(
    dtoOrParams: DealershipFilterParams,
    context?: { tenantId?: string },
  ): Promise<{ items: Dealership[]; meta: OffsetPaginationMeta }> {
    const tenantId = context?.tenantId ?? dtoOrParams.tenantId ?? '1';
    return this.dealershipRepo.paginateOffset({
      tenantId,
      code: dtoOrParams.code,
      name: dtoOrParams.name,
      page: dtoOrParams.page,
      limit: dtoOrParams.limit,
    });
  }

  public async findById(idOrParams: string | FindDealershipByIdParams, tenantId: string = '1'): Promise<Dealership | null> {
    if (typeof idOrParams === 'string') {
      return this.dealershipRepo.findById({ id: idOrParams, tenantId });
    }
    return this.dealershipRepo.findById(idOrParams);
  }
}
