import { Module } from '@nestjs/common';

/**
 * Core Business Bounded Context: Workshop / Service Scheduling (`@app/workshop`).
 *
 * Owns `settings`, `service-catalog`, `resource` (bays, technicians, skills, unavailabilities),
 * and `appointment` (availability, serialized allocation, state machine, atomic slot swap).
 * Communicates with `@app/crm` and `@app/organization` strictly via `@app/contracts`.
 */
@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class WorkshopModule {}
