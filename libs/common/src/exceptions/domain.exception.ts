import { HttpException } from '@nestjs/common';
import {
  ErrorCode,
  getErrorCodeDefaultMessage,
  getErrorCodeHttpStatus,
} from '../enums/error-code.enum';

export type SlotUnavailableReason = 'NO_FREE_BAY' | 'NO_QUALIFIED_TECHNICIAN';

export const SLOT_REASON_NO_FREE_BAY: SlotUnavailableReason = 'NO_FREE_BAY';
export const SLOT_REASON_NO_QUALIFIED_TECHNICIAN: SlotUnavailableReason =
  'NO_QUALIFIED_TECHNICIAN';

/**
 * Base domain exception carrying a unified `ErrorCode`, HTTP status, and structured details (§9.1).
 */
export class DomainException extends HttpException {
  private readonly resolvedHttpStatus: number;

  public constructor(
    public readonly errorCode: ErrorCode,
    message?: string,
    public readonly details: unknown = null,
    httpStatus?: number,
  ) {
    const trimmedMessage = message?.trim() ?? '';
    const resolvedMessage =
      trimmedMessage !== '' ? trimmedMessage : getErrorCodeDefaultMessage(errorCode);
    const resolvedStatus = httpStatus ?? getErrorCodeHttpStatus(errorCode);

    super(
      {
        errorCode,
        message: resolvedMessage,
        details,
      },
      resolvedStatus,
    );

    this.resolvedHttpStatus = resolvedStatus;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public getErrorCode(): ErrorCode {
    return this.errorCode;
  }

  public getHttpStatus(): number {
    return this.resolvedHttpStatus;
  }

  public getDetails(): unknown {
    return this.details;
  }
}

export class SlotUnavailableException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.SLOT_UNAVAILABLE, message, details);
  }

  public static withAlternatives(
    reason: SlotUnavailableReason,
    alternatives: unknown[] = [],
    message?: string,
  ): SlotUnavailableException {
    return new SlotUnavailableException(message, {
      reason,
      alternatives,
    });
  }
}

export class DealershipFullyBookedException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.DEALERSHIP_FULLY_BOOKED, message, details);
  }
}

export class TechnicianUnavailableException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.TECHNICIAN_UNAVAILABLE, message, details);
  }
}

export class BayUnavailableException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.BAY_UNAVAILABLE, message, details);
  }
}

export class VehicleAlreadyBookedException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.VEHICLE_ALREADY_BOOKED, message, details);
  }
}

export class SlotSwapConflictException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.SLOT_SWAP_CONFLICT, message, details);
  }
}

export class ActiveAppointmentLimitReachedException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.ACTIVE_APPOINTMENT_LIMIT_REACHED, message, details);
  }
}

export class InvalidStateTransitionException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.INVALID_STATE_TRANSITION, message, details);
  }
}

export class VersionConflictException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.VERSION_CONFLICT, message, details);
  }
}

export class PreconditionRequiredException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.PRECONDITION_REQUIRED, message, details);
  }
}

export class IdempotencyInProgressException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.IDEMPOTENCY_IN_PROGRESS, message, details);
  }
}

export class IdempotencyKeyReusedException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.IDEMPOTENCY_KEY_REUSED, message, details);
  }
}

export class UnauthenticatedException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.UNAUTHENTICATED, message, details);
  }
}

export class ForbiddenDomainException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.FORBIDDEN, message, details);
  }
}

export class ResourceNotFoundException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.NOT_FOUND, message, details);
  }
}

export class ValidationFailedException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.VALIDATION_FAILED, message, details);
  }
}

export class TooManyRequestsDomainException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.TOO_MANY_REQUESTS, message, details);
  }
}

export class ServiceUnavailableDomainException extends DomainException {
  public constructor(message?: string, details: unknown = null) {
    super(ErrorCode.SERVICE_UNAVAILABLE, message, details);
  }
}
