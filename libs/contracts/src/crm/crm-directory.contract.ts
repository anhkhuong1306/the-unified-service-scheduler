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
}
