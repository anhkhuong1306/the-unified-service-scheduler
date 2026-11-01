export interface DealershipFilterParams {
  tenantId?: string;
  code?: string;
  name?: string;
  page?: number;
  limit?: number;
}

export interface DealershipCursorParams {
  tenantId: string;
  cursor?: string;
  limit?: number;
}

export interface FindDealershipByIdParams {
  id: string;
  tenantId?: string;
}
