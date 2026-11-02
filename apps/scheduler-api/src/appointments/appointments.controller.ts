import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { from, Observable, switchMap } from 'rxjs';
import {
  ApiDocErrors,
  ApiDocPaginated,
  ApiDocSuccess,
  ApiResponse,
  ApiResponseEnvelope,
  CursorPaginationDto,
  DEFAULT_TENANT_ID,
  RequestContextService,
  ValidationFailedException,
} from '@app/common';
import {
  Appointment,
  AppointmentService,
  AppointmentStreamService,
  CancelAppointmentUseCase,
  CreateAppointmentUseCase,
  DealershipAvailableSlotsResponseDto,
  ResourceAvailabilityService,
  UpdateAppointmentDto,
  UpdateAppointmentUseCase,
} from '@app/workshop';
import {
  AppointmentAvailabilityQueryDto,
  AppointmentQueryDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
} from './dto';
import {
  APPOINTMENT_AVAILABILITY_SUCCESS_SAMPLE,
  APPOINTMENT_CANCEL_BODY_EXAMPLES,
  APPOINTMENT_CREATE_BODY_EXAMPLES,
  APPOINTMENT_SSE_STREAM_SAMPLE,
  APPOINTMENT_UPDATE_BODY_EXAMPLES,
  SAMPLE_APPOINTMENT_DATA,
} from './samples/appointment-swagger.samples';

@ApiTags('Appointments')
@ApiBearerAuth()
@Controller({ path: 'v1/appointments' })
export class AppointmentsController {
  public constructor(
    private readonly availabilityService: ResourceAvailabilityService,
    private readonly createAppointmentUseCase: CreateAppointmentUseCase,
    private readonly cancelAppointmentUseCase: CancelAppointmentUseCase,
    private readonly updateAppointmentUseCase: UpdateAppointmentUseCase,
    private readonly appointmentService: AppointmentService,
    private readonly streamService: AppointmentStreamService,
  ) {}

  @Get('availability')
  @ApiOperation({
    summary:
      'Query slot grid availability for a given dealership with optional filters (service_type_ids, technician_ids, date) and offset pagination',
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Available slot grid returned successfully',
    example: APPOINTMENT_AVAILABILITY_SUCCESS_SAMPLE,
  })
  @ApiDocErrors([400, 401, 404, 500])
  public async getAvailability(
    @Query() queryDto: AppointmentAvailabilityQueryDto,
  ): Promise<ApiResponseEnvelope<DealershipAvailableSlotsResponseDto>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const dealershipId = queryDto.dealershipId;

    if (!dealershipId) {
      throw new ValidationFailedException(
        'dealership_id is required to query availability',
      );
    }

    const serviceTypeIds = queryDto.serviceTypeIds;
    const technicianIds = queryDto.technicianIds;

    const result = await this.availabilityService.getDealershipAvailableSlots(
      tenantId,
      dealershipId,
      {
        date: queryDto.date,
        serviceTypeIds,
        technicianIds,
        page: queryDto.page,
        limit: queryDto.limit,
      },
    );

    const { meta, ...data } = result;
    return ApiResponse.build(200, null, data, 'OK', meta);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Real-time SSE event stream for authenticated customer' })
  @ApiDocSuccess({
    status: 200,
    description: 'SSE live event stream established (emits ping every 15s and status transitions)',
    example: APPOINTMENT_SSE_STREAM_SAMPLE,
  })
  @ApiDocErrors([401])
  public stream(): Observable<MessageEvent> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    return from(this.appointmentService.resolveCustomer(actorSub, tenantId)).pipe(
      switchMap((customer) => this.streamService.streamForCustomer(customer.id, tenantId)),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book a service appointment with serialized allocation & exclusion protection' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'UUID or unique idempotency key' })
  @ApiBody({
    type: CreateAppointmentDto,
    description: 'Appointment booking payload in snake_case format',
    examples: APPOINTMENT_CREATE_BODY_EXAMPLES,
  })
  @ApiDocSuccess({
    status: 201,
    description: 'Service appointment successfully booked and serialized',
    example: SAMPLE_APPOINTMENT_DATA,
  })
  @ApiDocErrors([400, 401, 409, 500])
  public async create(
    @Body() dto: CreateAppointmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<Appointment> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    const appointment = await this.createAppointmentUseCase.execute(
      dto,
      {
        actorSub,
        actorType,
        tenantId,
      },
      idempotencyKey,
    );

    return this.appointmentService.enrichAppointmentDetails(appointment, tenantId);
  }

  @Get()
  @ApiOperation({
    summary:
      'List service appointments with offset-based pagination and multi-criteria filters (date, reference_code, customer, technician, service_type, status)',
  })
  @ApiDocPaginated({
    description: 'Appointments listed successfully with offset pagination',
    exampleItem: SAMPLE_APPOINTMENT_DATA,
    total: 1,
  })
  @ApiDocErrors([400, 401, 500])
  public async list(
    @Query() queryDto: AppointmentQueryDto,
  ): Promise<ApiResponseEnvelope<Appointment[]>> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    if (queryDto.cursor) {
      const result = await this.appointmentService.listMyAppointmentsPaginated(actorSub, tenantId, {
        cursor: queryDto.cursor,
        limit: queryDto.limit,
      });
      return ApiResponse.cursorPaginated(result.items, result.meta);
    }

    let enforcedCustomerId: string | undefined;
    if (actorType === 'customer') {
      const customer = await this.appointmentService.resolveCustomer(actorSub, tenantId);
      enforcedCustomerId = customer.id;
    }

    const result = await this.appointmentService.listAppointmentsOffsetPaginated(queryDto, {
      tenantId,
      customerId: enforcedCustomerId,
    });

    return ApiResponse.offsetPaginated(result);
  }

  @Get('technician/:technicianId')
  @ApiOperation({
    summary:
      'List appointments assigned to a specific technician using cursor-based pagination (Boss Directive 8)',
  })
  @ApiParam({ name: 'technicianId', description: 'Technician identifier', example: '1' })
  @ApiDocPaginated({
    description: 'Technician appointments returned with cursor pagination',
    exampleItem: SAMPLE_APPOINTMENT_DATA,
    total: 1,
  })
  @ApiDocErrors([400, 401, 500])
  public async listTechnicianAppointments(
    @Param('technicianId') technicianId: string,
    @Query() paginationDto: CursorPaginationDto,
  ): Promise<ApiResponseEnvelope<Appointment[]>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const result = await this.appointmentService.listTechnicianAppointmentsCursorPaginated(
      technicianId,
      tenantId,
      paginationDto,
    );
    return ApiResponse.cursorPaginated(result.items, result.meta);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific service appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointment details returned successfully',
    example: SAMPLE_APPOINTMENT_DATA,
  })
  @ApiDocErrors([400, 401, 404, 500])
  public async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<Appointment> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    let customerId: string | undefined;
    if (actorType === 'customer') {
      const customer = await this.appointmentService.resolveCustomer(actorSub, tenantId);
      customerId = customer.id;
    }

    return this.appointmentService.getAppointmentById(id, customerId, tenantId);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer update scheduled appointment details with optimistic lock protection' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: UpdateAppointmentDto,
    description: 'Update appointment payload in snake_case format',
    examples: APPOINTMENT_UPDATE_BODY_EXAMPLES,
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointment successfully updated',
    example: {
      ...SAMPLE_APPOINTMENT_DATA,
      start_at: '2026-11-03T09:30:00.000Z',
      version: 2,
    },
  })
  @ApiDocErrors([400, 401, 404, 409, 500])
  public async update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAppointmentDto,
    @Headers('if-match') ifMatchHeader?: string,
  ): Promise<Appointment> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    if (ifMatchHeader && dto.version === undefined) {
      const parsedVersion = parseInt(ifMatchHeader.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(parsedVersion)) {
        dto.version = parsedVersion;
      }
    }

    const updated = await this.updateAppointmentUseCase.execute(
      id,
      dto,
      { actorSub, actorType, tenantId },
    );

    return this.appointmentService.enrichAppointmentDetails(updated, tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an existing service appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: CancelAppointmentDto,
    description: 'Optional cancellation payload',
    examples: APPOINTMENT_CANCEL_BODY_EXAMPLES,
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointment successfully cancelled',
    example: {
      ...SAMPLE_APPOINTMENT_DATA,
      status: 'CANCELLED',
      cancel_reason: 'Customer schedule conflict',
      version: 2,
    },
  })
  @ApiDocErrors([400, 401, 404, 409, 500])
  public async cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() bodyDto: CancelAppointmentDto = {},
  ): Promise<Appointment> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    return this.cancelAppointmentUseCase.execute(
      id,
      bodyDto.reason ?? 'Customer cancellation',
      {
        actorSub,
        actorType,
        tenantId,
      },
    );
  }
}
