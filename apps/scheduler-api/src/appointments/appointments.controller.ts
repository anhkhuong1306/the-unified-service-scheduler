import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequestContextService } from '@app/common';
import {
  Appointment,
  AppointmentService,
  AvailabilityResponseDto,
  CancelAppointmentUseCase,
  CreateAppointmentDto,
  CreateAppointmentUseCase,
  ResourceAvailabilityService,
} from '@app/workshop';

@ApiTags('Appointments')
@Controller({ path: 'v1/appointments' })
export class AppointmentsController {
  public constructor(
    private readonly availabilityService: ResourceAvailabilityService,
    private readonly createAppointmentUseCase: CreateAppointmentUseCase,
    private readonly cancelAppointmentUseCase: CancelAppointmentUseCase,
    private readonly appointmentService: AppointmentService,
  ) {}

  @Get('availability')
  @ApiOperation({ summary: 'Query slot grid availability for a given dealership, service type, and date' })
  @ApiQuery({ name: 'dealershipId', required: true, example: '1' })
  @ApiQuery({ name: 'serviceTypeId', required: true, example: '1' })
  @ApiQuery({ name: 'date', required: true, example: '2026-11-01' })
  public async getAvailability(
    @Query('dealershipId') dealershipId: string,
    @Query('serviceTypeId') serviceTypeId: string,
    @Query('date') date: string,
  ): Promise<AvailabilityResponseDto> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.availabilityService.getAvailability(tenantId, dealershipId, serviceTypeId, date);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book a service appointment with serialized allocation & exclusion protection' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'UUID or unique idempotency key' })
  public async create(
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Appointment> {
    const actorSub = RequestContextService.getActorSub() ?? 'a1111111-1111-1111-1111-111111111111';
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? 1);

    return this.createAppointmentUseCase.execute(
      dto,
      {
        actorSub,
        actorType,
        tenantId,
      },
      idempotencyKey,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List service appointments for the authenticated customer' })
  public async list(): Promise<Appointment[]> {
    const actorSub = RequestContextService.getActorSub() ?? 'a1111111-1111-1111-1111-111111111111';
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.appointmentService.listMyAppointments(actorSub, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific service appointment' })
  public async getById(@Param('id') id: string): Promise<Appointment> {
    const tenantId = String(RequestContextService.getTenantId() ?? 1);
    return this.appointmentService.getAppointmentById(id, undefined, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an existing service appointment' })
  public async cancel(
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ): Promise<Appointment> {
    const actorSub = RequestContextService.getActorSub() ?? 'a1111111-1111-1111-1111-111111111111';
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? 1);

    return this.cancelAppointmentUseCase.execute(
      id,
      reason ?? 'Customer cancellation',
      {
        actorSub,
        actorType,
        tenantId,
      },
    );
  }
}
