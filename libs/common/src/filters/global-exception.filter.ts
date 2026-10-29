import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CORRELATION_ID_HEADER,
  CORRELATION_ID_RESPONSE_HEADER,
} from '../context/request-context.interface';
import { RequestContextService } from '../context/request-context.service';
import {
  ErrorCode,
  getErrorCodeDefaultMessage,
} from '../enums/error-code.enum';
import { DomainException } from '../exceptions/domain.exception';
import {
  ENVELOPE_LOCALS_KEY,
  EXCEPTION_META_LOCALS_KEY,
} from '../interceptors/response-envelope.interceptor';
import { ApiResponse, ApiResponseEnvelope } from '../responses/api-response';

export const PG_EXCLUSION_VIOLATION_CODE = '23P01';
export const PG_LOCK_NOT_AVAILABLE_CODE = '55P03';
export const PG_DEADLOCK_DETECTED_CODE = '40P01';
export const MAX_EXCEPTION_STACK_FRAMES = 5;

export interface MappedExceptionResult {
  statusCode: number;
  envelope: ApiResponseEnvelope;
  exceptionMeta: Record<string, unknown>;
}

/**
 * Global exception filter mapping `DomainException`, NestJS `HttpException` / `ValidationPipe` errors,
 * PostgreSQL concurrency/exclusion constraint errors (`23P01`, `55P03`, `40P01`), and unexpected
 * runtime errors into the unified `ApiResponseEnvelope` (§8, §9.1).
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  /**
   * Convert any thrown exception into its standardized `ApiResponseEnvelope` and structured metadata.
   */
  public static toEnvelope(exception: unknown): MappedExceptionResult {
    const exceptionMeta = GlobalExceptionFilter.extractExceptionMeta(exception);

    if (exception instanceof DomainException) {
      const statusCode = exception.getHttpStatus();
      const envelope = ApiResponse.error(
        exception.getErrorCode(),
        exception.message,
        statusCode,
        exception.getDetails(),
      );
      return { statusCode, envelope, exceptionMeta };
    }

    const dbMapped = GlobalExceptionFilter.mapPostgresDriverError(exception);
    if (dbMapped) {
      return {
        statusCode: dbMapped.statusCode,
        envelope: dbMapped,
        exceptionMeta,
      };
    }

    if (
      exception instanceof BadRequestException ||
      exception instanceof UnprocessableEntityException
    ) {
      const responseBody = exception.getResponse();
      const validationDetails = GlobalExceptionFilter.extractValidationDetails(responseBody);
      const message = GlobalExceptionFilter.extractHttpExceptionMessage(
        exception,
        getErrorCodeDefaultMessage(ErrorCode.VALIDATION_FAILED),
      );

      const envelope = ApiResponse.error(
        ErrorCode.VALIDATION_FAILED,
        message,
        422,
        validationDetails,
      );
      return { statusCode: 422, envelope, exceptionMeta };
    }

    if (exception instanceof UnauthorizedException) {
      const message = GlobalExceptionFilter.extractHttpExceptionMessage(
        exception,
        getErrorCodeDefaultMessage(ErrorCode.UNAUTHENTICATED),
      );
      const envelope = ApiResponse.error(ErrorCode.UNAUTHENTICATED, message, 401);
      return { statusCode: 401, envelope, exceptionMeta };
    }

    if (exception instanceof ForbiddenException) {
      const message = GlobalExceptionFilter.extractHttpExceptionMessage(
        exception,
        getErrorCodeDefaultMessage(ErrorCode.FORBIDDEN),
      );
      const envelope = ApiResponse.error(ErrorCode.FORBIDDEN, message, 403);
      return { statusCode: 403, envelope, exceptionMeta };
    }

    if (exception instanceof NotFoundException) {
      const message = GlobalExceptionFilter.extractHttpExceptionMessage(
        exception,
        getErrorCodeDefaultMessage(ErrorCode.NOT_FOUND),
      );
      const envelope = ApiResponse.error(ErrorCode.NOT_FOUND, message, 404);
      return { statusCode: 404, envelope, exceptionMeta };
    }

    if (exception instanceof ServiceUnavailableException) {
      const message = GlobalExceptionFilter.extractHttpExceptionMessage(
        exception,
        getErrorCodeDefaultMessage(ErrorCode.SERVICE_UNAVAILABLE),
      );
      const envelope = ApiResponse.error(ErrorCode.SERVICE_UNAVAILABLE, message, 503);
      return { statusCode: 503, envelope, exceptionMeta };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const mappedCode = GlobalExceptionFilter.mapStatusToErrorCode(status, exception);
      const resolvedStatus = mappedCode === ErrorCode.VALIDATION_FAILED ? 422 : status;
      const message = GlobalExceptionFilter.extractHttpExceptionMessage(
        exception,
        getErrorCodeDefaultMessage(mappedCode),
      );

      const envelope = ApiResponse.error(mappedCode, message, resolvedStatus);
      return { statusCode: resolvedStatus, envelope, exceptionMeta };
    }

    // Fallback for unhandled Error / unknown exceptions — hide sensitive internal details in response
    const envelope = ApiResponse.error(
      ErrorCode.INTERNAL_ERROR,
      getErrorCodeDefaultMessage(ErrorCode.INTERNAL_ERROR),
      500,
      null,
    );

    return {
      statusCode: 500,
      envelope,
      exceptionMeta,
    };
  }

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (body: unknown) => void };
      setHeader?: (name: string, value: string) => void;
      locals?: Record<string, unknown>;
    }>();

    const incomingHeader = request?.headers?.[CORRELATION_ID_HEADER];
    const incomingCorrelationId = Array.isArray(incomingHeader)
      ? incomingHeader[0]
      : incomingHeader;

    if (incomingCorrelationId && incomingCorrelationId.trim() !== '') {
      RequestContextService.setCorrelationId(incomingCorrelationId.trim());
    }

    const { statusCode, envelope, exceptionMeta } =
      GlobalExceptionFilter.toEnvelope(exception);

    const correlationId = envelope.meta.correlation_id;
    if (typeof response?.setHeader === 'function') {
      response.setHeader(CORRELATION_ID_RESPONSE_HEADER, correlationId);
    }

    if (response) {
      response.locals = response.locals ?? {};
      response.locals[ENVELOPE_LOCALS_KEY] = envelope;
      response.locals[EXCEPTION_META_LOCALS_KEY] = exceptionMeta;
    }

    response.status(statusCode).json(envelope);
  }

  /**
   * Map PostgreSQL SQLSTATE codes (`23P01` exclusion constraints, `55P03` lock timeout, `40P01` deadlock).
   */
  private static mapPostgresDriverError(exception: unknown): ApiResponseEnvelope | null {
    if (typeof exception !== 'object' || exception === null) {
      return null;
    }

    const errRecord = exception as Record<string, unknown>;
    const driverError =
      typeof errRecord.driverError === 'object' && errRecord.driverError !== null
        ? (errRecord.driverError as Record<string, unknown>)
        : errRecord;

    const rawCode = String(driverError.code ?? errRecord.code ?? '');
    if (!rawCode) {
      return null;
    }

    const constraint = String(
      driverError.constraint ?? errRecord.constraint ?? '',
    ).toLowerCase();
    const message = String(driverError.message ?? errRecord.message ?? '').toLowerCase();
    const detail = String(driverError.detail ?? errRecord.detail ?? '').toLowerCase();
    const combinedText = `${constraint} ${message} ${detail}`;

    if (rawCode === PG_EXCLUSION_VIOLATION_CODE) {
      if (combinedText.includes('no_vehicle_overlap')) {
        return ApiResponse.error(ErrorCode.VEHICLE_ALREADY_BOOKED);
      }
      if (combinedText.includes('no_technician_overlap')) {
        return ApiResponse.error(ErrorCode.TECHNICIAN_UNAVAILABLE);
      }
      if (combinedText.includes('no_bay_overlap')) {
        return ApiResponse.error(ErrorCode.BAY_UNAVAILABLE);
      }
      return ApiResponse.error(ErrorCode.SLOT_UNAVAILABLE);
    }

    if (
      rawCode === PG_LOCK_NOT_AVAILABLE_CODE ||
      rawCode === PG_DEADLOCK_DETECTED_CODE
    ) {
      return ApiResponse.error(ErrorCode.SERVICE_UNAVAILABLE);
    }

    return null;
  }

  private static extractValidationDetails(responseBody: string | object): Record<string, unknown> {
    if (typeof responseBody === 'object' && responseBody !== null) {
      const record = responseBody as Record<string, unknown>;
      if (Array.isArray(record.message)) {
        return { errors: record.message };
      }
      if (record.errors !== undefined) {
        return { errors: record.errors };
      }
      if (typeof record.message === 'string') {
        return { errors: [record.message] };
      }
    }

    if (typeof responseBody === 'string' && responseBody.trim() !== '') {
      return { errors: [responseBody.trim()] };
    }

    return { errors: [] };
  }

  private static extractHttpExceptionMessage(
    exception: HttpException,
    fallback: string,
  ): string {
    const responseBody = exception.getResponse();
    if (typeof responseBody === 'object' && responseBody !== null) {
      const record = responseBody as Record<string, unknown>;
      if (typeof record.message === 'string' && record.message.trim() !== '') {
        return record.message.trim();
      }
      if (Array.isArray(record.message) && record.message.length > 0) {
        return fallback;
      }
    }

    if (typeof exception.message === 'string' && exception.message.trim() !== '') {
      return exception.message.trim();
    }

    return fallback;
  }

  private static mapStatusToErrorCode(status: number, exception: HttpException): ErrorCode {
    if ( exception.constructor?.name === 'ThrottlerException' || status === 429) {
      return ErrorCode.TOO_MANY_REQUESTS;
    }

    switch (status) {
      case 401:
        return ErrorCode.UNAUTHENTICATED;
      case 403:
        return ErrorCode.FORBIDDEN;
      case 404:
        return ErrorCode.NOT_FOUND;
      case 409:
        return ErrorCode.SLOT_UNAVAILABLE;
      case 422:
        return ErrorCode.VALIDATION_FAILED;
      case 428:
        return ErrorCode.PRECONDITION_REQUIRED;
      case 503:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  /**
   * Extract structured exception details (class, message, file, line, top stack frames) for `REQUEST_END` logs.
   */
  public static extractExceptionMeta(exception: unknown): Record<string, unknown> {
    if (exception instanceof Error) {
      const stackLines = (exception.stack ?? '')
        .split('\n')
        .slice(1)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(0, MAX_EXCEPTION_STACK_FRAMES);

      const firstFrame = stackLines[0] ?? '';
      const locationMatch = /at\s+(?:.+?\s+\()?(.+?):(\d+):\d+\)?$/.exec(firstFrame);
      const file = locationMatch?.[1] ?? null;
      const line = locationMatch?.[2] ? Number(locationMatch[2]) : null;

      return {
        class: exception.constructor?.name ?? exception.name ?? 'Error',
        message: exception.message,
        file,
        line,
        top_frames: stackLines,
      };
    }

    return {
      class: 'UnknownException',
      message: String(exception),
      file: null,
      line: null,
      top_frames: [],
    };
  }
}
