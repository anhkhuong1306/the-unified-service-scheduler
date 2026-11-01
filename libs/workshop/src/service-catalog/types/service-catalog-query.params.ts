export interface ServiceTypeFilterParams {
  tenantId?: string;
  code?: string;
  name?: string;
  page?: number;
  limit?: number;
}

export interface ServiceTypeCursorParams {
  tenantId?: string;
  cursor?: string;
  limit?: number;
}
