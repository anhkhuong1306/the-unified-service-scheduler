import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkshopSettings } from './settings/entities/workshop-settings.entity';
import { Skill } from './service-catalog/entities/skill.entity';
import { ServiceType } from './service-catalog/entities/service-type.entity';
import { ServiceBay } from './resource/entities/service-bay.entity';
import { Technician } from './resource/entities/technician.entity';
import { TechnicianSkill } from './resource/entities/technician-skill.entity';
import { Appointment } from './appointment/entities/appointment.entity';
import { AppointmentDetail } from './appointment/entities/appointment-detail.entity';
import { AppointmentEvent } from './appointment/entities/appointment-event.entity';
import { IdempotencyKey } from './appointment/entities/idempotency-key.entity';
import { ResourceAvailabilityService } from './resource/services/resource-availability.service';
import { ServiceCatalogService } from './service-catalog/services/service-catalog.service';
import { ServiceCatalogRepository } from './service-catalog/repositories/service-catalog.repository';
import { ServiceTypeRepository } from './service-catalog/repositories/service-type.repository';
import { CreateAppointmentUseCase } from './appointment/usecases/create-appointment.usecase';
import { CancelAppointmentUseCase } from './appointment/usecases/cancel-appointment.usecase';
import { UpdateAppointmentUseCase } from './appointment/usecases/update-appointment.usecase';
import { ReassignAppointmentUseCase } from './appointment/usecases/reassign-appointment.usecase';
import { RescheduleAppointmentUseCase } from './appointment/usecases/reschedule-appointment.usecase';
import { SwapAppointmentsUseCase } from './appointment/usecases/swap-appointments.usecase';
import { TransitionAppointmentStatusUseCase } from './appointment/usecases/transition-appointment-status.usecase';
import { AppointmentStateMachine } from './appointment/state-machine/appointment.state-machine';
import { AppointmentStreamService } from './appointment/services/appointment-stream.service';
import { AppointmentService } from './appointment/services/appointment.service';
import { AppointmentRepository } from './appointment/repositories/appointment.repository';
import { AppointmentDetailRepository } from './appointment/repositories/appointment-detail.repository';
import { AppointmentAvailabilityRepository } from './appointment/repositories/appointment-availability.repository';
import { IdempotencyRepository } from './appointment/repositories/idempotency.repository';
import { AppointmentEventRepository } from './appointment/repositories/appointment-event.repository';
import { BookingLockRepository } from './appointment/repositories/booking-lock.repository';
import { WorkshopSettingsRepository } from './settings/repositories/workshop-settings.repository';
import { TechnicianRepository } from './resource/repositories/technician.repository';
import { ServiceBayRepository } from './resource/repositories/service-bay.repository';
import { AppointmentSlotValidator } from './appointment/services/appointment-slot-validator.service';
import { SlotPolicy } from './appointment/domain/slot-policy';
import { Clock } from './appointment/services/clock';
import { BookingLockService } from './appointment/services/booking-lock.service';
import { IdempotencyService } from './appointment/services/idempotency.service';
import { ReferenceCodeGenerator } from './appointment/services/reference-code.generator';
import { CustomerResolverService } from './appointment/services/customer-resolver.service';
import { ResourceAllocator } from './appointment/services/resource-allocator.service';
import { AppointmentEventsService } from './appointment/services/appointment-events.service';
import { WorkshopCacheService } from './cache/workshop-cache.service';

const WORKSHOP_ENTITIES = [
  WorkshopSettings,
  Skill,
  ServiceType,
  ServiceBay,
  Technician,
  TechnicianSkill,
  Appointment,
  AppointmentDetail,
  AppointmentEvent,
  IdempotencyKey,
];

const WORKSHOP_REPOSITORIES = [
  AppointmentRepository,
  AppointmentDetailRepository,
  AppointmentAvailabilityRepository,
  IdempotencyRepository,
  AppointmentEventRepository,
  BookingLockRepository,
  ServiceCatalogRepository,
  ServiceTypeRepository,
  WorkshopSettingsRepository,
  TechnicianRepository,
  ServiceBayRepository,
];

const WORKSHOP_SERVICES = [
  Clock,
  SlotPolicy,
  BookingLockService,
  IdempotencyService,
  ReferenceCodeGenerator,
  CustomerResolverService,
  ResourceAllocator,
  AppointmentEventsService,
  AppointmentSlotValidator,
  ResourceAvailabilityService,
  ServiceCatalogService,
  CreateAppointmentUseCase,
  CancelAppointmentUseCase,
  UpdateAppointmentUseCase,
  ReassignAppointmentUseCase,
  RescheduleAppointmentUseCase,
  SwapAppointmentsUseCase,
  TransitionAppointmentStatusUseCase,
  AppointmentStateMachine,
  AppointmentStreamService,
  AppointmentService,
  WorkshopCacheService,
];

/**
 * Core Business Bounded Context: Workshop / Service Scheduling (`@app/workshop`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([...WORKSHOP_ENTITIES])],
  controllers: [],
  providers: [...WORKSHOP_REPOSITORIES, ...WORKSHOP_SERVICES],
  exports: [TypeOrmModule, ...WORKSHOP_REPOSITORIES, ...WORKSHOP_SERVICES],
})
export class WorkshopModule {}
