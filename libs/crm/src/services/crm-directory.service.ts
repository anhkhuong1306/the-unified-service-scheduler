import { Injectable, Optional } from '@nestjs/common';
import {
  CursorPaginationDto,
  CursorPaginationMeta,
  OffsetPaginationMeta,
  RedisService,
} from '@app/common';
import {
  CustomerSnapshotDto,
  ICrmDirectoryContract,
  VehicleSnapshotDto,
} from '@app/contracts';
import { CustomerRepository, VehicleRepository } from '../repositories';
import { CustomerFilterParams, VehicleFilterParams } from '../types';

const CUSTOMER_CACHE_TTL = 86400; // 24 hours

@Injectable()
export class CrmDirectoryService implements ICrmDirectoryContract {
  public constructor(
    private readonly customerRepo: CustomerRepository,
    private readonly vehicleRepo: VehicleRepository,
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

    const customer = await this.customerRepo.findBySubject(identitySubject, tenantId);
    if (!customer) {
      return null;
    }
    const snapshot: CustomerSnapshotDto = {
      id: customer.id,
      tenantId: customer.tenantId,
      identitySubject: customer.identitySubject,
      code: customer.code ?? '',
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
    const paginated = await this.customerRepo.paginateCursor({
      tenantId,
      cursor: cursorDto.cursor,
      limit: cursorDto.limit,
    });

    const items: CustomerSnapshotDto[] = paginated.items.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      identitySubject: c.identitySubject,
      code: c.code ?? '',
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
    const vehicle = await this.vehicleRepo.findOwnedByCustomer(vehicleId, customerId, tenantId);
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
    const vehicles = await this.vehicleRepo.findByIds(vehicleIds, tenantId);
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
    const vehicles = await this.vehicleRepo.findByCustomerId(customerId, tenantId);
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

    const paginated = await this.vehicleRepo.paginateCursorByCustomerId({
      customerId: customer.id,
      tenantId,
      cursor: cursorDto.cursor,
      limit: cursorDto.limit,
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

  public async listVehiclesOffsetPaginated(
    dtoOrParams: VehicleFilterParams,
    context?: {
      actorSub?: string;
      tenantId?: string;
    },
  ): Promise<{ items: VehicleSnapshotDto[]; meta: OffsetPaginationMeta }> {
    const tenantId = context?.tenantId ?? dtoOrParams.tenantId ?? '1';
    const actorSub = context?.actorSub ?? dtoOrParams.actorSub;
    let customerId = dtoOrParams.customerId ?? dtoOrParams.customer_id;

    if (actorSub && !customerId) {
      const customer = await this.findCustomerBySubject(actorSub, tenantId);
      if (!customer) {
        return {
          items: [],
          meta: { total: 0, page: 1, limit: dtoOrParams.limit ?? 20, totalPages: 0, hasNext: false, hasPrev: false },
        };
      }
      customerId = customer.id;
    }

    const paginated = await this.vehicleRepo.paginateOffset({
      ...dtoOrParams,
      tenantId,
      customerId,
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

  public async listCustomersOffsetPaginated(
    dtoOrParams: CustomerFilterParams,
    context?: {
      tenantId?: string;
    },
  ): Promise<{ items: CustomerSnapshotDto[]; meta: OffsetPaginationMeta }> {
    const tenantId = context?.tenantId ?? dtoOrParams.tenantId ?? '1';
    const paginated = await this.customerRepo.paginateOffset({
      ...dtoOrParams,
      tenantId,
    });

    const items: CustomerSnapshotDto[] = paginated.items.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      identitySubject: c.identitySubject,
      code: c.code ?? '',
      name: c.name,
      email: c.email,
      phone: c.phone,
    }));

    return {
      items,
      meta: paginated.meta,
    };
  }
}
