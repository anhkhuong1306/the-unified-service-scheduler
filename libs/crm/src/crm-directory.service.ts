import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CursorPaginationDto, CursorPaginationHelper, CursorPaginationMeta, RedisService } from '@app/common';
import {
  CustomerSnapshotDto,
  ICrmDirectoryContract,
  VehicleSnapshotDto,
} from '@app/contracts';
import { Customer } from './customer/customer.entity';
import { Vehicle } from './vehicle/vehicle.entity';

const CUSTOMER_CACHE_TTL = 86400; // 24 hours

@Injectable()
export class CrmDirectoryService implements ICrmDirectoryContract {
  public constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @Optional()
    private readonly redis?: RedisService,
  ) {}

  private getCustomersKey(tenantId: string = '1'): string {
    return `tenant:${tenantId}:customers`;
  }

  public async findCustomerBySubject(
    identitySubject: string,
    tenantId: string = '1',
  ): Promise<CustomerSnapshotDto | null> {
    const key = this.getCustomersKey(tenantId);
    const subField = `sub:${identitySubject}`;

    if (this.redis) {
      const cached = await this.redis.hget<CustomerSnapshotDto>(key, subField);
      if (cached) {
        return cached;
      }
    }

    const customer = await this.customerRepo.findOne({
      where: { identitySubject, tenantId },
    });
    if (!customer) {
      return null;
    }
    const snapshot: CustomerSnapshotDto = {
      id: customer.id,
      tenantId: customer.tenantId,
      identitySubject: customer.identitySubject,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
    };

    if (this.redis) {
      await this.redis.hset(key, subField, snapshot, CUSTOMER_CACHE_TTL);
      await this.redis.hset(key, customer.id, snapshot, CUSTOMER_CACHE_TTL);
    }

    return snapshot;
  }

  public async listCustomersPaginated(
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: CustomerSnapshotDto[]; meta: CursorPaginationMeta }> {
    const qb = this.customerRepo.createQueryBuilder('customer')
      .where('customer.tenant_id = :tenantId', { tenantId });

    const paginated = await CursorPaginationHelper.paginateQueryBuilder(qb, cursorDto, {
      sortField: 'id',
      sortOrder: 'ASC',
    });

    const items: CustomerSnapshotDto[] = paginated.items.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      identitySubject: c.identitySubject,
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));

    return {
      items,
      meta: paginated.meta,
    };
  }

  public async findVehicleOwnedByCustomer(
    vehicleId: string,
    customerId: string,
    tenantId: string = '1',
  ): Promise<VehicleSnapshotDto | null> {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id: vehicleId, customerId, tenantId },
      relations: ['customer'],
    });
    if (!vehicle) {
      return null;
    }
    return {
      id: vehicle.id,
      tenantId: vehicle.tenantId,
      customerId: vehicle.customerId,
      customerName: vehicle.customer?.name ?? '',
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vehicleLabel: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
    };
  }

  public async getVehiclesByIds(
    vehicleIds: readonly string[],
    tenantId: string = '1',
  ): Promise<VehicleSnapshotDto[]> {
    if (vehicleIds.length === 0) {
      return [];
    }
    const vehicles = await this.vehicleRepo.find({
      where: { id: In([...vehicleIds]), tenantId },
      relations: ['customer'],
    });
    return vehicles.map((v) => ({
      id: v.id,
      tenantId: v.tenantId,
      customerId: v.customerId,
      customerName: v.customer?.name ?? '',
      vin: v.vin,
      licensePlate: v.licensePlate,
      make: v.make,
      model: v.model,
      year: v.year,
      vehicleLabel: `${v.year} ${v.make} ${v.model}`,
    }));
  }

  public async listVehiclesByCustomerId(
    customerId: string,
    tenantId: string = '1',
  ): Promise<VehicleSnapshotDto[]> {
    const vehicles = await this.vehicleRepo.find({
      where: { customerId, tenantId },
      relations: ['customer'],
      order: { id: 'ASC' },
    });
    return vehicles.map((v) => ({
      id: v.id,
      tenantId: v.tenantId,
      customerId: v.customerId,
      customerName: v.customer?.name ?? '',
      vin: v.vin,
      licensePlate: v.licensePlate,
      make: v.make,
      model: v.model,
      year: v.year,
      vehicleLabel: `${v.year} ${v.make} ${v.model}`,
    }));
  }

  public async listVehiclesByActorSub(
    identitySubject: string,
    tenantId: string = '1',
  ): Promise<VehicleSnapshotDto[]> {
    const customer = await this.findCustomerBySubject(identitySubject, tenantId);
    if (!customer) {
      return [];
    }
    return this.listVehiclesByCustomerId(customer.id, tenantId);
  }

  public async listVehiclesByActorSubPaginated(
    identitySubject: string,
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: VehicleSnapshotDto[]; meta: CursorPaginationMeta }> {
    const customer = await this.findCustomerBySubject(identitySubject, tenantId);
    if (!customer) {
      return {
        items: [],
        meta: {
          limit: Number(cursorDto.limit) || 20,
          nextCursor: null,
          hasMore: false,
        },
      };
    }

    const qb = this.vehicleRepo.createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.customer', 'customer')
      .where('vehicle.customer_id = :customerId', { customerId: customer.id })
      .andWhere('vehicle.tenant_id = :tenantId', { tenantId });

    const paginated = await CursorPaginationHelper.paginateQueryBuilder(qb, cursorDto, {
      sortField: 'id',
      sortOrder: 'ASC',
    });

    const items: VehicleSnapshotDto[] = paginated.items.map((v) => ({
      id: v.id,
      tenantId: v.tenantId,
      customerId: v.customerId,
      customerName: v.customer?.name ?? '',
      vin: v.vin,
      licensePlate: v.licensePlate,
      make: v.make,
      model: v.model,
      year: v.year,
      vehicleLabel: `${v.year} ${v.make} ${v.model}`,
    }));

    return {
      items,
      meta: paginated.meta,
    };
  }
}
