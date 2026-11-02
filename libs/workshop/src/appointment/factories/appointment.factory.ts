import { Appointment } from '../entities/appointment.entity';
import { AppointmentDetail } from '../entities/appointment-detail.entity';
import { AppointmentStatus } from '../enums/appointment-status.enum';
import { CreateAppointmentDto } from '../dto/create-appointment.dto';
import { ActorContext } from '../types/actor-context.interface';
import { ServiceType } from '../../service-catalog/entities/service-type.entity';
import { WorkshopSettings } from '../../settings/entities/workshop-settings.entity';
import { Slot } from '../types/resource-allocator.types';

export interface BuildAppointmentParams {
  dto: CreateAppointmentDto;
  actor: ActorContext;
  customer: { id: string; name?: string };
  vehicle: { licensePlate: string; vehicleLabel: string; customerName?: string };
  slot: Slot;
  serviceTypes: ServiceType[];
  allocatedBayId: string;
  allocatedTechnicianId: string;
  referenceCode: string;
  settings: WorkshopSettings;
}

export class AppointmentFactory {
  public static createAppointment(params: BuildAppointmentParams): Appointment {
    const {
      dto,
      actor,
      customer,
      vehicle,
      slot,
      serviceTypes,
      allocatedBayId,
      allocatedTechnicianId,
      referenceCode,
      settings,
    } = params;

    const initialStatus = settings.requiresApproval
      ? AppointmentStatus.PENDING
      : AppointmentStatus.CONFIRMED;

    const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;

    const appointment = new Appointment();
    appointment.tenantId = actor.tenantId;
    appointment.referenceCode = referenceCode;
    appointment.dealershipId = dto.dealershipId;
    appointment.customerId = customer.id;
    appointment.vehicleId = dto.vehicleId;
    appointment.serviceTypeId = serviceTypes[0].id;
    appointment.serviceTypeIds = serviceTypes.map((st) => st.id);
    appointment.serviceBayId = allocatedBayId;
    appointment.technicianId = allocatedTechnicianId;
    appointment.customerName = customer.name || vehicle.customerName || '';
    appointment.vehiclePlate = vehicle.licensePlate;
    appointment.vehicleLabel = vehicle.vehicleLabel;
    appointment.startAt = slot.startAt;
    appointment.endAt = slot.endAt;
    appointment.occupiedUntil = slot.occupiedUntil;
    appointment.status = initialStatus;
    appointment.notes = dto.customerNotes ?? dto.notes ?? null;
    appointment.version = 1;
    appointment.created_by = actorIdentifier;
    appointment.updated_by = actorIdentifier;
    appointment.createdBy = actorIdentifier;
    appointment.updatedBy = actorIdentifier;

    return appointment;
  }

  public static createDetails(
    appointmentId: string,
    serviceTypes: ServiceType[],
    actor: ActorContext,
  ): AppointmentDetail[] {
    const actorIdentifier = actor.actorCode || actor.actorName || actor.actorSub;

    return serviceTypes.map((st, idx) => {
      const detail = new AppointmentDetail();
      detail.tenantId = actor.tenantId;
      detail.appointmentId = appointmentId;
      detail.serviceTypeId = st.id;
      detail.code = st.code;
      detail.name = st.name;
      detail.durationMinutes = st.durationMinutes;
      detail.price = (st as any).price ?? 0;
      detail.sequenceOrder = idx + 1;
      detail.created_by = actorIdentifier;
      detail.updated_by = actorIdentifier;
      detail.createdBy = actorIdentifier;
      detail.updatedBy = actorIdentifier;
      return detail;
    });
  }
}
