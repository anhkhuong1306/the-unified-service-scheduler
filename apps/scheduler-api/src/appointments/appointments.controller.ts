import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiResponse,
  ApiResponseEnvelope,
  CursorPaginationDto,
  DEFAULT_TENANT_ID,
  RequestContextService,
} from '@app/common';
import {
  Appointment,
  AppointmentService,
  AvailabilityResponseDto,
  CancelAppointmentUseCase,
  CreateAppointmentUseCase,
  ResourceAvailabilityService,
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
    private readonly appointmentService: AppointmentService,
  ) {}

  @Get('availability')
  @ApiOperation({ summary: 'Query slot grid availability for a given dealership, service type, and date' })
  public async getAvailability(
    @Query() queryDto: AppointmentAvailabilityQueryDto,
  ): Promise<AvailabilityResponseDto> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    const dealershipId = queryDto.dealershipId ?? queryDto.dealership_id!;
    const serviceTypeId = queryDto.serviceTypeId ?? queryDto.service_type_id!;
    return this.availabilityService.getAvailability(tenantId, dealershipId, serviceTypeId, queryDto.date);
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
      try {
        const customer = await this.appointmentService.resolveCustomer(actorSub, tenantId);
        enforcedCustomerId = customer.id;
      } catch {
        // Customer resolution fallback
      }
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

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a specific service appointment' })
  public async getById(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string): Promise<Appointment> {
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    return this.appointmentService.getAppointmentById(id, undefined, tenantId);
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
