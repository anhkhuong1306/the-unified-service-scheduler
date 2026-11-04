import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { from, Observable, switchMap } from 'rxjs';
import {
  ApiDocErrors,
  ApiDocSuccess,
  DEFAULT_TENANT_ID,
  RequestContextService,
} from '@app/common';
import { StaffRepository } from '@app/organization';
import {
  ActorContext,
  Appointment,
  AppointmentStreamService,
  ReassignAppointmentDto,
  ReassignAppointmentUseCase,
  RescheduleAppointmentDto,
  RescheduleAppointmentUseCase,
  SwapAppointmentsDto,
  SwapAppointmentsUseCase,
  SwapResult,
  TransitionAppointmentStatusUseCase,
  TransitionStatusDto,
} from '@app/workshop';
import { StaffStreamQueryDto } from './dto';
import { SAMPLE_APPOINTMENT_DATA } from './samples/appointment-swagger.samples';
import {
  STAFF_ACTION_BODY_EXAMPLES,
  STAFF_REASSIGN_BODY_EXAMPLES,
  STAFF_RESCHEDULE_BODY_EXAMPLES,
  STAFF_STREAM_SAMPLE,
  STAFF_SWAP_BODY_EXAMPLES,
  STAFF_SWAP_SUCCESS_SAMPLE,
} from './samples/staff-appointment-swagger.samples';

@ApiTags('Staff Appointments')
@ApiBearerAuth()
@Controller({ path: 'v1/staff/appointments' })
export class StaffAppointmentsController {
  public constructor(
    private readonly transitionUseCase: TransitionAppointmentStatusUseCase,
    private readonly reassignUseCase: ReassignAppointmentUseCase,
    private readonly rescheduleUseCase: RescheduleAppointmentUseCase,
    private readonly swapUseCase: SwapAppointmentsUseCase,
    private readonly streamService: AppointmentStreamService,
    private readonly staffRepo: StaffRepository,
  ) {}

  private async getActorContext(): Promise<ActorContext> {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    if (actorType !== 'staff' && actorType !== 'system') {
      throw new ForbiddenException('Only staff or system actors can perform workshop staff operations');
    }
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);

    let dealershipId: string | null = null;
    let actorName: string | undefined;

    if (actorType === 'staff') {
      const staffMember = await this.staffRepo.findByIdentitySubject(actorSub, tenantId);
      if (!staffMember || !staffMember.dealershipId) {
        throw new ForbiddenException('Staff member profile or assigned dealership not found');
      }
      dealershipId = String(staffMember.dealershipId);
      actorName = staffMember.name;
    }

    return {
      actorSub,
      actorType,
      tenantId,
      dealershipId,
      actorName,
    };
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Real-time SSE event stream for staff dealership board' })
  @ApiDocSuccess({
    status: 200,
    description: 'Live SSE event stream active (emits ping every 15s and all dealership events)',
    example: STAFF_STREAM_SAMPLE,
  })
  @ApiDocErrors([401, 403])
  public stream(
    @Query() queryDto: StaffStreamQueryDto = {},
  ): Observable<MessageEvent> {
    return from(this.getActorContext()).pipe(
      switchMap((actor) => {
        const dealershipId = actor.dealershipId ?? queryDto.dealershipId ?? undefined;
        return this.streamService.streamForStaff(dealershipId, queryDto.technicianId, actor.tenantId);
      }),
    );
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff atomically swap schedule slots between two appointments in the same dealership' })
  @ApiBody({
    type: SwapAppointmentsDto,
    description: 'Swap payload with two appointment UUIDs',
    examples: STAFF_SWAP_BODY_EXAMPLES,
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointments atomically swapped successfully',
    example: STAFF_SWAP_SUCCESS_SAMPLE,
  })
  @ApiDocErrors([400, 401, 403, 404, 409, 500])
  public async swap(
    @Body() dto: SwapAppointmentsDto,
  ): Promise<SwapResult> {
    const actor = await this.getActorContext();
    return this.swapUseCase.execute(dto, actor);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff approve a pending appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: TransitionStatusDto,
    examples: { approve: STAFF_ACTION_BODY_EXAMPLES.approve },
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointment approved to CONFIRMED status',
    example: { ...SAMPLE_APPOINTMENT_DATA, status: 'CONFIRMED', version: 2 },
  })
  @ApiDocErrors([400, 401, 403, 404, 409, 500])
  public async approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.transitionUseCase.execute(id, 'approve', actor, dto.reason);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff reject a pending appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: TransitionStatusDto,
    examples: { reject: STAFF_ACTION_BODY_EXAMPLES.reject },
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointment rejected',
    example: { ...SAMPLE_APPOINTMENT_DATA, status: 'REJECTED', version: 2 },
  })
  @ApiDocErrors([400, 401, 403, 404, 500])
  public async reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.transitionUseCase.execute(id, 'reject', actor, dto.reason);
  }

  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receptionist check-in customer vehicle upon arrival' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: TransitionStatusDto,
    examples: { checkIn: STAFF_ACTION_BODY_EXAMPLES.checkIn },
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Vehicle checked in to CHECKED_IN status',
    example: { ...SAMPLE_APPOINTMENT_DATA, status: 'CHECKED_IN', version: 2 },
  })
  @ApiDocErrors([400, 401, 403, 404, 500])
  public async checkIn(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.transitionUseCase.execute(id, 'check_in', actor, dto.reason);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Technician start servicing the appointment' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: TransitionStatusDto,
    examples: { startService: STAFF_ACTION_BODY_EXAMPLES.start },
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Service started, transitioned to IN_PROGRESS',
    example: { ...SAMPLE_APPOINTMENT_DATA, status: 'IN_PROGRESS', version: 3 },
  })
  @ApiDocErrors([400, 401, 403, 404, 500])
  public async start(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.transitionUseCase.execute(id, 'start', actor, dto.reason);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Technician complete servicing and release service bay' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: TransitionStatusDto,
    examples: { completeService: STAFF_ACTION_BODY_EXAMPLES.complete },
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Service completed, bay released',
    example: { ...SAMPLE_APPOINTMENT_DATA, status: 'COMPLETED', version: 4 },
  })
  @ApiDocErrors([400, 401, 403, 404, 500])
  public async complete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.transitionUseCase.execute(id, 'complete', actor, dto.reason);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff mark appointment as no-show after grace period' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: TransitionStatusDto,
    examples: { noShow: STAFF_ACTION_BODY_EXAMPLES.noShow },
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointment marked as NO_SHOW',
    example: { ...SAMPLE_APPOINTMENT_DATA, status: 'NO_SHOW', version: 2 },
  })
  @ApiDocErrors([400, 401, 403, 404, 500])
  public async noShow(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.transitionUseCase.execute(id, 'no_show', actor, dto.reason);
  }

  @Post(':id/reassign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff reassign technician or service bay' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: ReassignAppointmentDto,
    examples: STAFF_REASSIGN_BODY_EXAMPLES,
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Technician or bay reassigned successfully',
    example: { ...SAMPLE_APPOINTMENT_DATA, technician_id: '2', version: 2 },
  })
  @ApiDocErrors([400, 401, 403, 404, 409, 500])
  public async reassign(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReassignAppointmentDto,
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.reassignUseCase.execute(id, dto, actor);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff reschedule appointment for early arrival with lead-time bypass' })
  @ApiParam({ name: 'id', description: 'Appointment UUID v4', example: 'a1111111-1111-4111-8111-111111111111' })
  @ApiBody({
    type: RescheduleAppointmentDto,
    examples: STAFF_RESCHEDULE_BODY_EXAMPLES,
  })
  @ApiDocSuccess({
    status: 200,
    description: 'Appointment rescheduled successfully',
    example: {
      ...SAMPLE_APPOINTMENT_DATA,
      start_at: '2026-11-03T07:30:00.000Z',
      version: 2,
    },
  })
  @ApiDocErrors([400, 401, 403, 404, 409, 500])
  public async reschedule(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ): Promise<Appointment> {
    const actor = await this.getActorContext();
    return this.rescheduleUseCase.execute(id, dto, actor);
  }
}
