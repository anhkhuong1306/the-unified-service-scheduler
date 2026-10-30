import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkshopSettings } from './settings/workshop-settings.entity';
import { Skill } from './service-catalog/skill.entity';
import { ServiceType } from './service-catalog/service-type.entity';
import { ServiceBay } from './resource/service-bay.entity';
import { Technician } from './resource/technician.entity';
import { TechnicianSkill } from './resource/technician-skill.entity';
import { Appointment } from './appointment/appointment.entity';
import { AppointmentEvent } from './appointment/appointment-event.entity';
import { IdempotencyKey } from './appointment/idempotency-key.entity';
import { ResourceAvailabilityService } from './resource/resource-availability.service';
import { ServiceCatalogService } from './service-catalog/service-catalog.service';
import { CreateAppointmentUseCase } from './appointment/create-appointment.usecase';
import { CancelAppointmentUseCase } from './appointment/cancel-appointment.usecase';
import { AppointmentService } from './appointment/appointment.service';
import { SlotPolicy } from './appointment/domain/slot-policy';
import { Clock } from './appointment/services/clock';
import { BookingLockService } from './appointment/services/booking-lock.service';
import { IdempotencyService } from './appointment/services/idempotency.service';
import { ReferenceCodeGenerator } from './appointment/services/reference-code.generator';
import { CustomerResolverService } from './appointment/services/customer-resolver.service';
import { AppointmentAvailabilityRepository } from './appointment/repositories/appointment-availability.repository';
import { ResourceAllocator } from './appointment/services/resource-allocator.service';
import { AppointmentEventsService } from './appointment/services/appointment-events.service';

const WORKSHOP_ENTITIES = [
  WorkshopSettings,
  Skill,
  ServiceType,
  ServiceBay,
  Technician,
  TechnicianSkill,
  Appointment,
  AppointmentEvent,
  IdempotencyKey,
];

const WORKSHOP_SERVICES = [
  Clock,
  SlotPolicy,
  BookingLockService,
  IdempotencyService,
  ReferenceCodeGenerator,
  CustomerResolverService,
  AppointmentAvailabilityRepository,
  ResourceAllocator,
  AppointmentEventsService,
  ResourceAvailabilityService,
  ServiceCatalogService,
  CreateAppointmentUseCase,
  CancelAppointmentUseCase,
  AppointmentService,
];

/**
 * Core Business Bounded Context: Workshop / Service Scheduling (`@app/workshop`).
 */
@Module({
  imports: [TypeOrmModule.forFeature([...WORKSHOP_ENTITIES])],
  controllers: [],
  providers: [...WORKSHOP_SERVICES],
  exports: [TypeOrmModule, ...WORKSHOP_SERVICES],
})
export class WorkshopModule {}
