import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CursorPaginationDto, CursorPaginationHelper, CursorPaginationMeta } from '@app/common';
import { Appointment } from './appointment.entity';
import { CustomerResolverService } from './services/customer-resolver.service';

@Injectable()
export class AppointmentService {
  public constructor(
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    private readonly customerResolver: CustomerResolverService,
  ) {}

  /**
   * Retrieves all appointments belonging to the customer resolved from the authentication subject token.
   */
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
    return this.appointmentRepo.find({
      where: { customerId, tenantId },
      order: { startAt: 'DESC' },
    });
  }

  /**
   * Retrieves paginated appointments for the authenticated customer using cursor pagination.
   */
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
    const qb = this.appointmentRepo
      .createQueryBuilder('appointment')
      .where('appointment.customer_id = :customerId', { customerId })
      .andWhere('appointment.tenant_id = :tenantId', { tenantId });

    return CursorPaginationHelper.paginateQueryBuilder(qb, cursorDto, {
      sortField: 'id',
      sortOrder: 'DESC',
    });
  }

  public async getAppointmentById(
    appointmentId: string,
    customerId?: string,
    tenantId: string = '1',
  ): Promise<Appointment> {
    const whereClause: Record<string, unknown> = { id: appointmentId, tenantId };
    if (customerId) {
      whereClause.customerId = customerId;
    }
    const appointment = await this.appointmentRepo.findOne({
      where: whereClause,
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment ${appointmentId} not found`);
    }
    return appointment;
  }
}
