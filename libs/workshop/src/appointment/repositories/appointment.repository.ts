import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  ActiveAppointmentLimitReachedException,
  CursorPaginationHelper,
  CursorPaginationMeta,
  DEFAULT_TENANT_ID,
  OffsetPaginationHelper,
  OffsetPaginationMeta,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import {
  AppointmentFilterParams,
  CustomerCursorParams,
  TechnicianCursorParams,
} from '../types/appointment-query.params';
import {
  HydratedCustomer,
  HydratedDealership,
  HydratedServiceBay,
  HydratedTechnician,
  HydratedVehicle,
} from '../types/appointment-hydration.params';

@Injectable()
export class AppointmentRepository {
  public constructor(
    @InjectRepository(Appointment)
    private readonly repo: Repository<Appointment>,
    private readonly dataSource: DataSource,
  ) {}

  public async findById(id: string, customerId?: string, tenantId: string = DEFAULT_TENANT_ID): Promise<Appointment | null> {
    const whereClause: Record<string, unknown> = { id, tenantId };
    if (customerId) {
      whereClause.customerId = customerId;
    }
    return this.repo.findOne({ where: whereClause });
  }

  public async save(appointment: Appointment): Promise<Appointment> {
    return this.repo.save(appointment);
  }

  // --- Transactional Repository Methods ---

  public async findByIdWithLock(
    manager: EntityManager,
    id: string,
    tenantId: string = DEFAULT_TENANT_ID,
  ): Promise<Appointment | null> {
    return manager.findOne(Appointment, {
      where: { id, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  public async findByIdTransactional(
    manager: EntityManager,
    id: string,
    tenantId: string = DEFAULT_TENANT_ID,
  ): Promise<Appointment | null> {
    return manager.findOne(Appointment, {
      where: { id, tenantId },
    });
  }

  public async countActiveByCustomer(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    activeStatuses: string[],
  ): Promise<number> {
    return manager.count(Appointment, {
      where: { tenantId, customerId, status: In(activeStatuses) },
    });
  }

  public async assertCustomerActiveLimit(
    manager: EntityManager,
    tenantId: string,
    customerId: string,
    maxActiveAllowed: number,
    activeStatuses: string[],
  ): Promise<void> {
    const currentCount = await this.countActiveByCustomer(
      manager,
      tenantId,
      customerId,
      activeStatuses,
    );
    if (currentCount >= maxActiveAllowed) {
      throw new ActiveAppointmentLimitReachedException(
        `Maximum active appointments limit (${maxActiveAllowed}) reached for this customer`,
      );
    }
  }

  public async saveTransactional(
    manager: EntityManager,
    appointment: Appointment,
  ): Promise<Appointment> {
    return manager.save(Appointment, appointment);
  }

  public async findOffsetPaginated(
    params: AppointmentFilterParams,
  ): Promise<{ items: Appointment[]; meta: OffsetPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const customerId = params.customerId;
    const dealershipId = params.dealershipId ?? params.dealership_id;
    const technicianId = params.technicianId ?? params.technician;
    const serviceTypeId = params.serviceTypeId ?? params.service_type ?? params.serviceType;
    const status = params.status;
    const referenceCode = params.referenceCode ?? params.reference_code;
    const customerFilter = params.customerFilter ?? params.customer;
    const date = params.date;
    const page = params.page;
    const limit = params.limit;

    const qb = this.repo
      .createQueryBuilder('appointment')
      .where('appointment.tenant_id = :tenantId', { tenantId });

    if (customerId) {
      qb.andWhere('appointment.customer_id = :customerId', { customerId });
    }

    if (dealershipId) {
      qb.andWhere('appointment.dealership_id = :dealershipId', { dealershipId });
    }

    if (technicianId) {
      qb.andWhere('appointment.technician_id = :technicianId', { technicianId });
    }

    if (serviceTypeId) {
      qb.andWhere('appointment.service_type_id = :serviceTypeId', { serviceTypeId });
    }

    if (status) {
      qb.andWhere('appointment.status = :status', { status });
    }

    if (referenceCode) {
      qb.andWhere('appointment.reference_code ILIKE :refCode', {
        refCode: `%${referenceCode.trim()}%`,
      });
    }

    if (customerFilter) {
      const cust = customerFilter.trim();
      if (/^\d+$/.test(cust)) {
        qb.andWhere('(appointment.customer_id = :custNum OR appointment.customer_name ILIKE :custStr)', {
          custNum: cust,
          custStr: `%${cust}%`,
        });
      } else {
        qb.andWhere('appointment.customer_name ILIKE :custStr', {
          custStr: `%${cust}%`,
        });
      }
    }

    if (date) {
      qb.andWhere('appointment.start_at::date = :dateVal', { dateVal: date });
    }

    qb.orderBy('appointment.start_at', 'DESC')
      .addOrderBy('appointment.id', 'DESC');

    return OffsetPaginationHelper.paginateQueryBuilder(
      qb,
      { page, limit },
    );
  }

  public async findTechnicianCursorPaginated(
    params: TechnicianCursorParams,
  ): Promise<{ items: Appointment[]; meta: CursorPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const qb = this.repo
      .createQueryBuilder('appointment')
      .where('appointment.technician_id = :technicianId', { technicianId: params.technicianId })
      .andWhere('appointment.tenant_id = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(
      qb,
      { cursor: params.cursor, limit: params.limit },
      {
        sortField: 'startAt',
        sortOrder: 'DESC',
        idField: 'id',
        idType: 'uuid',
      },
    );
  }

  public async findCustomerCursorPaginated(
    params: CustomerCursorParams,
  ): Promise<{ items: Appointment[]; meta: CursorPaginationMeta }> {
    const tenantId = params.tenantId ?? DEFAULT_TENANT_ID;
    const customerId = (params as any).customerId ?? params.actorSub;
    const qb = this.repo
      .createQueryBuilder('appointment')
      .where('appointment.tenant_id = :tenantId', { tenantId })
      .andWhere('appointment.customer_id = :customerId', { customerId });

    return CursorPaginationHelper.paginateQueryBuilder(
      qb,
      { cursor: params.cursor, limit: params.limit },
      {
        sortField: 'startAt',
        sortOrder: 'DESC',
        idField: 'id',
        idType: 'uuid',
      },
    );
  }

  // --- Master Entity Snapshot Queries for Detail Hydration ---

  public async findDealershipSnapshot(dealershipId: string): Promise<HydratedDealership | null> {
    const [dlr] = await this.dataSource.query(
      `SELECT id, code, name FROM dealerships WHERE id = $1`,
      [dealershipId],
    );
    if (!dlr) return null;
    return {
      id: String(dlr.id),
      code: dlr.code,
      name: dlr.name,
    };
  }

  public async findCustomerSnapshot(customerId: string): Promise<HydratedCustomer | null> {
    const [cust] = await this.dataSource.query(
      `SELECT id, code, name, email, phone FROM customers WHERE id = $1`,
      [customerId],
    );
    if (!cust) return null;
    return {
      id: String(cust.id),
      code: cust.code,
      name: cust.name,
      email: cust.email,
      phone: cust.phone,
    };
  }

  public async findTechnicianSnapshot(technicianId: string): Promise<HydratedTechnician | null> {
    const [tech] = await this.dataSource.query(
      `SELECT id, code, name FROM technicians WHERE id = $1`,
      [technicianId],
    );
    if (!tech) return null;
    return {
      id: String(tech.id),
      code: tech.code,
      name: tech.name,
    };
  }

  public async findServiceBaySnapshot(serviceBayId: string): Promise<HydratedServiceBay | null> {
    const [bay] = await this.dataSource.query(
      `SELECT id, code FROM service_bays WHERE id = $1`,
      [serviceBayId],
    );
    if (!bay) return null;
    return {
      id: String(bay.id),
      code: bay.code,
    };
  }

  public async findVehicleSnapshot(vehicleId: string): Promise<HydratedVehicle | null> {
    const [veh] = await this.dataSource.query(
      `SELECT id, license_plate as "licensePlate", make, model, year, vin FROM vehicles WHERE id = $1`,
      [vehicleId],
    );
    if (!veh) return null;
    return {
      id: String(veh.id),
      licensePlate: veh.licensePlate,
      make: veh.make,
      model: veh.model,
      year: Number(veh.year),
      vin: veh.vin,
      vehicleLabel: `${veh.year} ${veh.make} ${veh.model}`.trim(),
    };
  }
}
