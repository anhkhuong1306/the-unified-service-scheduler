export interface CustomerFilterParams {
  tenantId?: string;
  code?: string;
  name?: string;
  page?: number;
  limit?: number;
}

export interface CustomerCursorParams {
  tenantId?: string;
  cursor?: string;
  limit?: number;
}

export interface VehicleFilterParams {
  actorSub?: string;
  tenantId?: string;
  customerId?: string;
  customer_id?: string;
  licensePlate?: string;
  license_plate?: string;
  model?: string;
  page?: number;
  limit?: number;
}

export interface VehicleCursorParams {
  customerId: string;
  tenantId: string;
  cursor?: string;
  limit?: number;
}
