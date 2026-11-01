import { AppointmentStatus } from '../enums/appointment-status.enum';

export interface AppointmentFilterParams {
  tenantId?: string;
  customerId?: string;
  dealershipId?: string;
  dealership_id?: string;
  technicianId?: string;
  technician?: string;
  serviceTypeId?: string;
  service_type?: string;
  serviceType?: string;
  status?: AppointmentStatus;
  referenceCode?: string;
  reference_code?: string;
  customerFilter?: string;
  customer?: string;
  date?: string;
  page?: number;
  limit?: number;
}

export interface TechnicianCursorParams {
  technicianId: string;
  tenantId?: string;
  cursor?: string;
  limit?: number;
}

export interface CustomerCursorParams {
  actorSub: string;
  tenantId?: string;
  cursor?: string;
  limit?: number;
}

export interface GetAppointmentByIdParams {
  appointmentId: string;
  customerId?: string;
  tenantId?: string;
}
