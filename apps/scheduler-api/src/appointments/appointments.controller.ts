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
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { from, Observable, switchMap } from 'rxjs';
import {
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

@ApiTags('Appointments')
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
  public async getAvailability(
    @Query() queryDto: AppointmentAvailabilityQueryDto,
  ): Promise<ApiResponseEnvelope<DealershipAvailableSlotsResponseDto>> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const dealershipId =
      queryDto.dealer_ship_id ?? queryDto.dealership_id ?? queryDto.dealershipId;

    if (!dealershipId) {
      throw new ValidationFailedException(
        'dealer_ship_id (or dealership_id) is required to query availability',
      );
    }

    const serviceTypeIds =
      queryDto.service_type_ids ??
      queryDto.serviceTypeIds ??
      (queryDto.service_type_id ? [queryDto.service_type_id] : undefined) ??
      (queryDto.serviceTypeId ? [queryDto.serviceTypeId] : undefined);

    const technicianIds =
      queryDto.technician_ids ??
      queryDto.technicianIds ??
      (queryDto.technician_id ? [queryDto.technician_id] : undefined) ??
      (queryDto.technicianId ? [queryDto.technicianId] : undefined);

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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Book a service appointment with serialized allocation & exclusion protection' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'UUID or unique idempotency key' })
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
  public async list(
    @Query() queryDto: AppointmentQueryDto,
  ): Promise<ApiResponseEnvelope<Appointment[]>> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    // If client supplied a cursor (e.g. TC_APT_006 or cursor-based integration tests)
    if (queryDto.cursor) {
      const result = await this.appointmentService.listMyAppointmentsPaginated(actorSub, tenantId, {
        cursor: queryDto.cursor,
        limit: queryDto.limit,
      });
      return ApiResponse.cursorPaginated(result.items, result.meta);
    }

    // Enforce data isolation: if actor is customer, strictly restrict to their own customerId
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

  @Sse('stream')
  @ApiOperation({ summary: 'Real-time SSE event stream for authenticated customer' })
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

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific service appointment' })
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
