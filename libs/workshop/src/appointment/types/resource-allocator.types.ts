import { Slot } from '../domain/slot-calculator';

export interface AllocationParams {
  readonly dealershipId: string;
  readonly skillId?: string | null;
  readonly skillIds?: readonly string[];
  readonly requestedTechnicianId?: string;
  readonly slot: Slot;
}

export interface AllocatedResources {
  readonly bayId: string;
  readonly technicianId: string;
}
