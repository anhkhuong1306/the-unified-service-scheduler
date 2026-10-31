import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CursorPaginationDto, CursorPaginationHelper, CursorPaginationMeta } from '@app/common';
import { Dealership } from './dealership.entity';

@Injectable()
export class DealershipService {
  public constructor(
    @InjectRepository(Dealership)
    private readonly dealershipRepo: Repository<Dealership>,
  ) {}

  /**
   * Lists all operational dealerships for a given tenant.
   *
   * @param tenantId Multi-tenant boundary identifier.
   */
  public async listDealerships(tenantId: string = '1'): Promise<Dealership[]> {
    return this.dealershipRepo.find({
      where: { tenantId },
      order: { id: 'ASC' },
    });
  }

  /**
   * Lists all operational dealerships with cursor-based pagination.
   */
  public async listDealershipsPaginated(
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: Dealership[]; meta: CursorPaginationMeta }> {
    const qb = this.dealershipRepo
      .createQueryBuilder('dealership')
      .where('dealership.tenant_id = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(qb, cursorDto, {
      sortField: 'id',
      sortOrder: 'ASC',
    });
  }

  /**
   * Retrieves a specific dealership by primary identifier.
   *
   * @param id Dealership primary identifier.
   * @param tenantId Multi-tenant boundary identifier.
   */
  public async findById(id: string, tenantId: string = '1'): Promise<Dealership | null> {
    return this.dealershipRepo.findOne({
      where: { id, tenantId },
    });
  }
}
