import { Module } from '@nestjs/common';

/**
 * Customer & Asset Lifecycle Bounded Context (`@app/crm`).
 *
 * Owns `customer` and `vehicle` records (PII / GDPR boundary) and provides
 * the in-process implementation for `CRM_DIRECTORY_CONTRACT`.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class CrmModule {}
