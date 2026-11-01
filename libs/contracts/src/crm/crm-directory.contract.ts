/**
 * Public cross-module contract for `@app/crm` (SYSTEM_DESIGN.md §3.1 & §7.2).
 *
 * `@app/workshop` depends strictly on this contract token and snapshot DTOs
 * rather than importing internal entities or repositories from `@app/crm`.
 */
export const CRM_DIRECTORY_CONTRACT = Symbol('CRM_DIRECTORY_CONTRACT');

export interface CustomerSnapshotDto {
  readonly id: string;
  readonly tenantId: string;
  readonly identitySubject: string;
  readonly code: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
}

export interface VehicleSnapshotDto {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly vin: string;
  readonly licensePlate: string;
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly vehicleLabel: string;
}

export interface ICrmDirectoryContract {
  findCustomerBySubject(
    identitySubject: string,
    tenantId?: string,
  ): Promise<CustomerSnapshotDto | null>;

  findVehicleOwnedByCustomer(
    vehicleId: string,
    customerId: string,
    tenantId?: string,
  ): Promise<VehicleSnapshotDto | null>;

  getVehiclesByIds(
    vehicleIds: readonly string[],
    tenantId?: string,
  ): Promise<VehicleSnapshotDto[]>;

  listVehiclesByCustomerId(
    customerId: string,
    tenantId?: string,
  ): Promise<VehicleSnapshotDto[]>;

  listVehiclesByActorSub(
    identitySubject: string,
    tenantId?: string,
  ): Promise<VehicleSnapshotDto[]>;

  listVehiclesByActorSubPaginated(
    identitySubject: string,
    tenantId?: string,
    cursorDto?: { cursor?: string; limit?: number },
  ): Promise<{ items: VehicleSnapshotDto[]; meta: { limit: number; nextCursor: string | null; hasMore: boolean } }>;

  listVehiclesOffsetPaginated(
    dtoOrParams: {
      actorSub?: string;
      tenantId?: string;
      customerId?: string;
      customer_id?: string;
      licensePlate?: string;
      license_plate?: string;
      model?: string;
      page?: number;
      limit?: number;
    },
    context?: {
      actorSub?: string;
      tenantId?: string;
    },
  ): Promise<{
    items: VehicleSnapshotDto[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }>;

  listCustomersPaginated(
    tenantId?: string,
    cursorDto?: { cursor?: string; limit?: number },
  ): Promise<{ items: CustomerSnapshotDto[]; meta: { limit: number; nextCursor: string | null; hasMore: boolean } }>;

  listCustomersOffsetPaginated(
    dtoOrParams: {
      tenantId?: string;
      code?: string;
      name?: string;
      page?: number;
      limit?: number;
    },
    context?: {
      tenantId?: string;
    },
  ): Promise<{
    items: CustomerSnapshotDto[];
    meta: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }>;
}
