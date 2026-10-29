/**
 * Public cross-module contract for `@app/organization` (SYSTEM_DESIGN.md §3.1).
 *
 * Exposes tenant, dealership directory (name, address, IANA timezone), and
 * dealership staff identity bindings without coupling callers to `@app/organization` internals.
 */
export const ORGANIZATION_DIRECTORY_CONTRACT = Symbol(
  'ORGANIZATION_DIRECTORY_CONTRACT',
);

export interface DealershipDirectoryDto {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly address: string;
  readonly timezone: string;
}

export interface StaffDirectoryDto {
  readonly id: string;
  readonly tenantId: string;
  readonly dealershipId: string;
  readonly identitySubject: string;
  readonly name: string;
}

export interface IOrganizationDirectoryContract {
  findDealershipById(
    dealershipId: string,
    tenantId?: string,
  ): Promise<DealershipDirectoryDto | null>;

  listDealerships(tenantId?: string): Promise<DealershipDirectoryDto[]>;

  findStaffBySubject(
    identitySubject: string,
    tenantId?: string,
  ): Promise<StaffDirectoryDto | null>;
}
