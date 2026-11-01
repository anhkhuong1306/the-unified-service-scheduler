export interface ActorContext {
  readonly actorSub: string;
  readonly actorType: 'customer' | 'staff' | 'system' | 'anonymous';
  readonly customerId?: string;
  readonly tenantId: string;
  readonly dealershipId?: string | null;
  readonly roles?: readonly string[];
  readonly actorCode?: string;
  readonly actorName?: string;
}
