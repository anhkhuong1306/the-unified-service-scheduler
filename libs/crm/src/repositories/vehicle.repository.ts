import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CursorPaginationHelper,
  CursorPaginationMeta,
  OffsetPaginationHelper,
  OffsetPaginationMeta,
  DEFAULT_TENANT_ID,
} from '@app/common';
import { Vehicle } from '../entities/vehicle.entity';
import { VehicleCursorParams, VehicleFilterParams } from '../types/crm-query.params';

@Injectable()
export class VehicleRepository {
  public constructor(
    @InjectRepository(Vehicle)
    private readonly repo: Repository<Vehicle>,
  ) {}

  public async findOwnedByCustomer(
    vehicleId: string,
    customerId: string,
    tenantId: string = DEFAULT_TENANT_ID,
  ): Promise<Vehicle | null> {
    return this.repo.findOne({
      where: { id: vehicleId, customerId, tenantId },
      relations: ['customer'],
    });
  }

  public async findByIds(
    vehicleIds: readonly string[],
    tenantId: string = DEFAULT_TENANT_ID,
  ): Promise<Vehicle[]> {
    if (vehicleIds.length === 0) {
      return [];
    }
    return this.repo.find({
      where: { id: In([...vehicleIds]), tenantId },
      relations: ['customer'],
    });
  }

  public async findByCustomerId(
    customerId: string,
    tenantId: string = DEFAULT_TENANT_ID,
  ): Promise<Vehicle[]> {
    return this.repo.find({
      where: { customerId, tenantId },
      relations: ['customer'],
      order: { id: 'ASC' },
    });
  }

  public async paginateCursorByCustomerId(
    params: VehicleCursorParams,
  ): Promise<{ items: Vehicle[]; meta: CursorPaginationMeta }> {
    const qb = this.repo
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.customer', 'customer')
      .where('vehicle.customer_id = :customerId', { customerId: params.customerId })
      .andWhere('vehicle.tenant_id = :tenantId', { tenantId: params.tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(
      qb,
      { cursor: params.cursor, limit: params.limit },
      { sortField: 'id', sortOrder: 'ASC' },
    );
  }

  public async paginateOffset(
    params: VehicleFilterParams,
  ): Promise<{ items: Vehicle[]; meta: OffsetPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const customerId = params.customerId ?? params.customer_id;
    const licensePlate = params.licensePlate ?? params.license_plate;
    const model = params.model;

    const qb = this.repo
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.customer', 'customer')
      .where('vehicle.tenant_id = :tenantId', { tenantId });

    if (customerId) {
      qb.andWhere('vehicle.customer_id = :customerId', { customerId });
    }

    if (licensePlate) {
      qb.andWhere('vehicle.license_plate ILIKE :licensePlate', {
        licensePlate: `%${licensePlate.trim()}%`,
      });
    }

    if (model) {
      qb.andWhere('vehicle.model ILIKE :model', {
        model: `%${model.trim()}%`,
      });
    }

    return OffsetPaginationHelper.paginateQueryBuilder(
      qb,
      { page: params.page, limit: params.limit },
      { defaultSortField: 'id', defaultSortOrder: 'ASC' },
    );
  }
}
