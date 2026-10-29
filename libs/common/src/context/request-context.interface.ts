export type ActorType = 'customer' | 'staff' | 'system' | 'anonymous';

export const DEFAULT_ACTOR_TYPE: ActorType = 'system';
export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CORRELATION_ID_RESPONSE_HEADER = 'X-Correlation-ID';
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';
export const DEFAULT_CLIENT_PLATFORM = 'unknown';

export interface RequestContextStore {
  correlationId: string;
  actorSub: string | null;
  actorType: ActorType;
  tenantId: number | null;
  dealershipId: number | null;
  roles: string[];
}

export interface ActorContextPatch {
  actorSub?: string | null;
  actorType?: ActorType;
  tenantId?: number | null;
  dealershipId?: number | null;
  roles?: string[];
}
