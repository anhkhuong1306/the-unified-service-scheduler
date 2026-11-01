/**
 * System-wide default constants and environmental fallbacks (§11 of SYSTEM_DESIGN.md).
 */
export const DEFAULT_TENANT_ID = '1';
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_PAGINATION_LIMIT = 50;

export const BENCHMARK_DATE = '2026-11-01';

export const CACHE_TTL_ONE_DAY_SECONDS = 86400; // 24 hours
export const CACHE_TTL_ONE_HOUR_SECONDS = 3600;

export const LOCK_TIMEOUT_DEFAULT = '2s';
export const STATEMENT_TIMEOUT_DEFAULT = '5s';

export const DEFAULT_MAX_ACTIVE_PER_CUSTOMER = 3;
export const DEFAULT_SLOT_MINUTES = 30;
export const DEFAULT_BUFFER_MINUTES = 10;
export const DEFAULT_LEAD_TIME_HOURS = 2;
export const DEFAULT_CANCELLATION_CUTOFF_MINUTES = 120;
