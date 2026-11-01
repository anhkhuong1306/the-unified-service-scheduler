import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CursorPaginationDto,
  CursorPaginationMeta,
  OffsetPaginationMeta,
} from '@app/common';
import { Appointment } from '../entities/appointment.entity';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { AppointmentDetailRepository } from '../repositories/appointment-detail.repository';
import { CustomerResolverService } from './customer-resolver.service';
import { AppointmentFilterParams, GetAppointmentByIdParams } from '../types/appointment-query.params';

@Injectable()
export class AppointmentService {
  public constructor(
    private readonly appointmentRepo: AppointmentRepository,
    private readonly detailRepo: AppointmentDetailRepository,
    private readonly customerResolver: CustomerResolverService,
  ) {}

  public async listMyAppointments(
    actorSub: string,
    tenantId: string = '1',
  ): Promise<Appointment[]> {
    const customer = await this.customerResolver.resolve(actorSub, tenantId);
    return this.listCustomerAppointments(customer.id, tenantId);
  }

  public async listCustomerAppointments(
    customerId: string,
    tenantId: string = '1',
  ): Promise<Appointment[]> {
    const result = await this.appointmentRepo.findOffsetPaginated({
      tenantId,
      customerId,
      page: 1,
      limit: 1000,
    });
    return result.items;
  }

  public async listMyAppointmentsPaginated(
    actorSub: string,
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: Appointment[]; meta: CursorPaginationMeta }> {
    const customer = await this.customerResolver.resolve(actorSub, tenantId);
    return this.listCustomerAppointmentsPaginated(customer.id, tenantId, cursorDto);
  }

  public async listCustomerAppointmentsPaginated(
    customerId: string,
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: Appointment[]; meta: CursorPaginationMeta }> {
    return this.appointmentRepo.findCustomerCursorPaginated({
      actorSub: customerId,
      tenantId,
      cursor: cursorDto.cursor,
      limit: cursorDto.limit,
    });
  }

  public async listAppointmentsOffsetPaginated(
    dtoOrParams: AppointmentFilterParams,
    context?: {
      tenantId?: string;
      customerId?: string;
    },
  ): Promise<{ items: Appointment[]; meta: OffsetPaginationMeta }> {
    const tenantId = context?.tenantId ?? dtoOrParams.tenantId ?? '1';
    const customerId = context?.customerId ?? dtoOrParams.customerId;
    return this.appointmentRepo.findOffsetPaginated({
      ...dtoOrParams,
      tenantId,
      customerId,
    });
  }

  public async listTechnicianAppointmentsCursorPaginated(
    technicianId: string,
    tenantId: string = '1',
    cursorDto: CursorPaginationDto = {},
  ): Promise<{ items: Appointment[]; meta: CursorPaginationMeta }> {
    return this.appointmentRepo.findTechnicianCursorPaginated({
      technicianId,
      tenantId,
      cursor: cursorDto.cursor,
      limit: cursorDto.limit,
    });
  }

  public async getAppointmentById(
    paramsOrId: string | GetAppointmentByIdParams,
    customerId?: string,
    tenantId: string = '1',
  ): Promise<Appointment> {
    const appointmentId = typeof paramsOrId === 'string' ? paramsOrId : paramsOrId.appointmentId;
    const resolvedCustomerId = typeof paramsOrId === 'string' ? customerId : paramsOrId.customerId;
    const resolvedTenantId = typeof paramsOrId === 'string' ? tenantId : (paramsOrId.tenantId ?? '1');

    const appointment = await this.appointmentRepo.findById(appointmentId, resolvedCustomerId, resolvedTenantId);
    if (!appointment) {
      throw new NotFoundException(`Appointment ${appointmentId} not found`);
    }
    return this.enrichAppointmentDetails(appointment, resolvedTenantId);
  }

  public async enrichAppointmentDetails(
    appointment: Appointment,
    tenantId: string = '1',
  ): Promise<Appointment> {
    try {
      // 1. Fetch detailed services list from appointment_details repository
      let details = await this.detailRepo.findDetailsByAppointmentId(appointment.id);

      // Graceful fallback for historical records created prior to details table
      if (!details || details.length === 0) {
        const typeIds =
          appointment.serviceTypeIds && appointment.serviceTypeIds.length > 0
            ? appointment.serviceTypeIds
            : [appointment.serviceTypeId];
        const rawTypes = await this.detailRepo.findServiceTypesByIds(typeIds);
        details = rawTypes.map((st, idx) => ({
          id: st.id,
          tenantId,
          appointmentId: appointment.id,
          serviceTypeId: st.id,
          code: st.code,
          name: st.name,
          durationMinutes: st.durationMinutes,
          price: 0,
          sequenceOrder: idx + 1,
        })) as any;
      }
      appointment.details = details;
      appointment.services = details;

      // 2. Hydrate Dealership
      if (appointment.dealershipId) {
        const dlr = await this.appointmentRepo.findDealershipSnapshot(appointment.dealershipId);
        if (dlr) appointment.dealership = dlr;
      }

      // 3. Hydrate Customer
      if (appointment.customerId) {
        const cust = await this.appointmentRepo.findCustomerSnapshot(appointment.customerId);
        if (cust) appointment.customer = cust;
      }

      // 4. Hydrate Technician
      if (appointment.technicianId) {
        const tech = await this.appointmentRepo.findTechnicianSnapshot(appointment.technicianId);
        if (tech) appointment.technician = tech;
      }

      // 5. Hydrate Service Bay
      if (appointment.serviceBayId) {
        const bay = await this.appointmentRepo.findServiceBaySnapshot(appointment.serviceBayId);
        if (bay) appointment.serviceBay = bay;
      }

      // 6. Hydrate Vehicle details
      if (appointment.vehicleId) {
        const veh = await this.appointmentRepo.findVehicleSnapshot(appointment.vehicleId);
        if (veh) appointment.vehicle = veh;
      }
    } catch {
      // In case of query exception, return appointment base entity safely
    }

    return appointment;
  }

  public async resolveCustomer(actorSub: string, tenantId: string = '1') {
    return this.customerResolver.resolve(actorSub, tenantId);
  }
}
