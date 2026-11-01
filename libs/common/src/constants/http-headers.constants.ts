/**
 * Standardized HTTP Header constants for cross-module identity and routing (§11.1 of SYSTEM_DESIGN.md).
 */
export const HEADER_ACTOR_SUB = 'x-user-sub';
export const HEADER_ACTOR_TYPE = 'x-actor-type';
export const HEADER_TENANT_ID = 'x-tenant-id';
export const HEADER_ACTOR_CODE = 'x-user-code';
export const HEADER_ACTOR_NAME = 'x-user-name';
export const HEADER_IDEMPOTENCY_KEY = 'idempotency-key';
export const HEADER_ACCEPT_LANGUAGE = 'accept-language';
export const HEADER_CORRELATION_ID = 'x-correlation-id';
export const HEADER_CORRELATION_ID_RESPONSE = 'X-Correlation-ID';
