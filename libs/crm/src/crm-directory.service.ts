import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CustomerSnapshotDto,
  ICrmDirectoryContract,
  VehicleSnapshotDto,
} from '@app/contracts';
import { Customer } from './customer/customer.entity';
import { Vehicle } from './vehicle/vehicle.entity';

@Injectable()
export class CrmDirectoryService implements ICrmDirectoryContract {
  public constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  public async findCustomerBySubject(
    identitySubject: string,
    tenantId: string = '1',
  ): Promise<CustomerSnapshotDto | null> {
    const customer = await this.customerRepo.findOne({
      where: { identitySubject, tenantId },
    });
    if (!customer) {
      return null;
    }
    return {
      id: customer.id,
      tenantId: customer.tenantId,
      identitySubject: customer.identitySubject,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
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
}
