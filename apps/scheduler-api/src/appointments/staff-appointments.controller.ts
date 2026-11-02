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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { DEFAULT_TENANT_ID, RequestContextService } from '@app/common';
import {
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

@ApiTags('Staff Appointments')
@Controller({ path: 'v1/staff/appointments' })
export class StaffAppointmentsController {
  public constructor(
    private readonly transitionUseCase: TransitionAppointmentStatusUseCase,
    private readonly reassignUseCase: ReassignAppointmentUseCase,
    private readonly rescheduleUseCase: RescheduleAppointmentUseCase,
    private readonly swapUseCase: SwapAppointmentsUseCase,
    private readonly streamService: AppointmentStreamService,
  ) {}

  private getActorContext() {
    const actorSub = RequestContextService.getActorSub();
    if (!actorSub) {
      throw new UnauthorizedException('Missing authentication token or credentials');
    }
    const actorType = RequestContextService.getActorType();
    if (actorType !== 'staff' && actorType !== 'system') {
      throw new ForbiddenException('Only staff or system actors can perform workshop staff operations');
    }
    const tenantId = String(RequestContextService.getTenantId() ?? DEFAULT_TENANT_ID);
    return { actorSub, actorType, tenantId };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff approve a pending appointment' })
  public async approve(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.transitionUseCase.execute(id, 'approve', actor, dto.reason);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff reject a pending appointment' })
  public async reject(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.transitionUseCase.execute(id, 'reject', actor, dto.reason);
  }

  @Post(':id/check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receptionist check-in customer vehicle upon arrival' })
  public async checkIn(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.transitionUseCase.execute(id, 'check_in', actor, dto.reason);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Technician start servicing the appointment' })
  public async start(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.transitionUseCase.execute(id, 'start', actor, dto.reason);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Technician complete servicing and release service bay' })
  public async complete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.transitionUseCase.execute(id, 'complete', actor, dto.reason);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff mark appointment as no-show after grace period' })
  public async noShow(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: TransitionStatusDto = {},
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.transitionUseCase.execute(id, 'no_show', actor, dto.reason);
  }

  @Post(':id/reassign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff reassign technician or service bay' })
  public async reassign(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReassignAppointmentDto,
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.reassignUseCase.execute(id, dto, actor);
  }

  @Post(':id/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff reschedule appointment for early arrival with lead-time bypass' })
  public async reschedule(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ): Promise<Appointment> {
    const actor = this.getActorContext();
    return this.rescheduleUseCase.execute(id, dto, actor);
  }

  @Post('swap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Staff atomically swap schedule slots between two appointments in the same dealership' })
  public async swap(
    @Body() dto: SwapAppointmentsDto,
  ): Promise<SwapResult> {
    const actor = this.getActorContext();
    return this.swapUseCase.execute(dto, actor);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Real-time SSE event stream for staff dealership board' })
  public stream(
    @Query() queryDto: StaffStreamQueryDto = {},
  ): Observable<MessageEvent> {
    const actor = this.getActorContext();
    const dealershipId = queryDto.dealershipId ?? queryDto.dealership_id;
    const technicianId = queryDto.technicianId ?? queryDto.technician_id;
    return this.streamService.streamForStaff(dealershipId, technicianId, actor.tenantId);
  }
}
