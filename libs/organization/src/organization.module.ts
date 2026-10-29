import { Module } from '@nestjs/common';

/**
 * Organizational & Tenant Directory Bounded Context (`@app/organization`).
 *
 * Owns `tenant`, `dealership` (identity, address, IANA timezone), and `staff` records,
 * and provides the in-process implementation for `ORGANIZATION_DIRECTORY_CONTRACT`.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class OrganizationModule {}
