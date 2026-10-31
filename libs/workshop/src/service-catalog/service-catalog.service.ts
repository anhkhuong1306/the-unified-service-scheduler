import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CursorPaginationDto, CursorPaginationHelper, CursorPaginationMeta } from '@app/common';
import { ServiceType } from './service-type.entity';

@Injectable()
export class ServiceCatalogService {
  public constructor(
    @InjectRepository(ServiceType)
    private readonly serviceTypeRepo: Repository<ServiceType>,
  ) {}

  /**
   * Retrieves all active service types for a given tenant with their associated skill requirements.
   *
   * @param tenantId Multi-tenant boundary identifier.
   * @returns Array of ServiceType entities.
   */
  public async listServiceTypes(tenantId: string = '1'): Promise<ServiceType[]> {
    return this.serviceTypeRepo.find({
      where: { tenantId },
      relations: ['skill'],
      order: { id: 'ASC' },
    });
  }

  /**
   * Retrieves active service types with cursor-based pagination.
   */
  public async listServiceTypesPaginated(
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: ServiceType[]; meta: CursorPaginationMeta }> {
    const qb = this.serviceTypeRepo
      .createQueryBuilder('serviceType')
      .leftJoinAndSelect('serviceType.skill', 'skill')
      .where('serviceType.tenant_id = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(qb, cursorDto, {
      sortField: 'id',
      sortOrder: 'ASC',
    });
  }

  /**
   * Finds a specific service type by its primary identifier.
   *
   * @param id Service type primary identifier.
   * @param tenantId Multi-tenant boundary identifier.
   * @returns ServiceType entity or null if not found.
   */
  public async findById(id: string, tenantId: string = '1'): Promise<ServiceType | null> {
    return this.serviceTypeRepo.findOne({
      where: { id, tenantId },
      relations: ['skill'],
    });
  }
}
