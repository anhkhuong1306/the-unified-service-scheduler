/**
 * Unified machine-readable error codes as defined in SYSTEM_DESIGN.md §9.1.
 */
export enum ErrorCode {
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SLOT_UNAVAILABLE = 'SLOT_UNAVAILABLE',
  DEALERSHIP_FULLY_BOOKED = 'DEALERSHIP_FULLY_BOOKED',
  TECHNICIAN_UNAVAILABLE = 'TECHNICIAN_UNAVAILABLE',
  BAY_UNAVAILABLE = 'BAY_UNAVAILABLE',
  VEHICLE_ALREADY_BOOKED = 'VEHICLE_ALREADY_BOOKED',
  SLOT_SWAP_CONFLICT = 'SLOT_SWAP_CONFLICT',
  ACTIVE_APPOINTMENT_LIMIT_REACHED = 'ACTIVE_APPOINTMENT_LIMIT_REACHED',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  PRECONDITION_REQUIRED = 'PRECONDITION_REQUIRED',
  IDEMPOTENCY_IN_PROGRESS = 'IDEMPOTENCY_IN_PROGRESS',
  IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export const ERROR_CODE_HTTP_STATUS: Record<ErrorCode, number> = {
  [ErrorCode.UNAUTHENTICATED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VALIDATION_FAILED]: 422,
  [ErrorCode.SLOT_UNAVAILABLE]: 409,
  [ErrorCode.DEALERSHIP_FULLY_BOOKED]: 409,
  [ErrorCode.TECHNICIAN_UNAVAILABLE]: 409,
  [ErrorCode.BAY_UNAVAILABLE]: 409,
  [ErrorCode.VEHICLE_ALREADY_BOOKED]: 409,
  [ErrorCode.SLOT_SWAP_CONFLICT]: 409,
  [ErrorCode.ACTIVE_APPOINTMENT_LIMIT_REACHED]: 409,
  [ErrorCode.INVALID_STATE_TRANSITION]: 409,
  [ErrorCode.VERSION_CONFLICT]: 409,
  [ErrorCode.PRECONDITION_REQUIRED]: 428,
  [ErrorCode.IDEMPOTENCY_IN_PROGRESS]: 409,
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]: 422,
  [ErrorCode.TOO_MANY_REQUESTS]: 429,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

export const ERROR_CODE_DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  [ErrorCode.UNAUTHENTICATED]: 'Authentication is required to access this resource.',
  [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ErrorCode.NOT_FOUND]: 'The requested resource was not found.',
  [ErrorCode.VALIDATION_FAILED]: 'The given data failed validation.',
  [ErrorCode.SLOT_UNAVAILABLE]: 'Requested time slot is unavailable.',
  [ErrorCode.DEALERSHIP_FULLY_BOOKED]: 'Dealership is fully booked for the requested period.',
  [ErrorCode.TECHNICIAN_UNAVAILABLE]:
    'The requested technician is unavailable for the selected time slot.',
  [ErrorCode.BAY_UNAVAILABLE]: 'No service bay is available for the selected time slot.',
  [ErrorCode.VEHICLE_ALREADY_BOOKED]: 'The vehicle already has an overlapping active appointment.',
  [ErrorCode.SLOT_SWAP_CONFLICT]: 'Cannot swap slots due to resource or schedule conflict.',
  [ErrorCode.ACTIVE_APPOINTMENT_LIMIT_REACHED]:
    'Maximum number of active appointments per customer has been reached.',
  [ErrorCode.INVALID_STATE_TRANSITION]:
    'The requested appointment status transition is not allowed.',
  [ErrorCode.VERSION_CONFLICT]:
    'The resource was modified by another request. Please refresh and try again.',
  [ErrorCode.PRECONDITION_REQUIRED]:
    'The If-Match header with the current resource version is required.',
  [ErrorCode.IDEMPOTENCY_IN_PROGRESS]:
    'A request with the same Idempotency-Key is currently being processed.',
  [ErrorCode.IDEMPOTENCY_KEY_REUSED]:
    'The Idempotency-Key has already been used with a different request payload.',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Too many requests. Please slow down and try again later.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service is temporarily unavailable. Please retry shortly.',
  [ErrorCode.INTERNAL_ERROR]: 'An unexpected internal error occurred.',
};

export function getErrorCodeHttpStatus(code: ErrorCode): number {
  return ERROR_CODE_HTTP_STATUS[code] ?? 500;
}

export function getErrorCodeDefaultMessage(code: ErrorCode): string {
  return ERROR_CODE_DEFAULT_MESSAGE[code] ?? ERROR_CODE_DEFAULT_MESSAGE[ErrorCode.INTERNAL_ERROR];
}
