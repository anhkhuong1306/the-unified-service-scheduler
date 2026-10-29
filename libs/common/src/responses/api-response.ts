import { RequestContextService } from '../context/request-context.service';
import {
  ErrorCode,
  getErrorCodeDefaultMessage,
  getErrorCodeHttpStatus,
} from '../enums/error-code.enum';

export const DEFAULT_SUCCESS_MESSAGE = 'OK';
export const DEFAULT_CREATED_MESSAGE = 'Created';

export interface ApiResponseMeta {
  correlation_id: string;
  page?: number;
  per_page?: number;
  total?: number;
  [key: string]: unknown;
}

export interface ApiResponseEnvelope<T = unknown> {
  statusCode: number;
  errorCode: string | null;
  data: T;
  message: string;
  meta: ApiResponseMeta;
}

/**
 * Unified API response envelope builder as specified in SYSTEM_DESIGN.md §9.1.
 */
export class ApiResponse {
  /**
   * Build the standardized response envelope and ensure `meta.correlation_id` is always populated.
   */
  public static build<T = unknown>(
    statusCode: number,
    errorCode: string | null,
    data: T,
    message: string,
    meta: Record<string, unknown> = {},
  ): ApiResponseEnvelope<T> {
    const rawCorrelationId =
      typeof meta.correlation_id === 'string' ? meta.correlation_id.trim() : '';
    const correlationId =
      rawCorrelationId !== '' ? rawCorrelationId : RequestContextService.getCorrelationId();

    return {
      statusCode,
      errorCode,
      data,
      message,
      meta: {
        ...meta,
        correlation_id: correlationId,
      },
    };
  }

  /**
   * Build a successful 200 OK (or custom 2xx) response envelope.
   */
  public static success<T = unknown>(
    data: T = null as unknown as T,
    message: string = DEFAULT_SUCCESS_MESSAGE,
    statusCode = 200,
    meta: Record<string, unknown> = {},
  ): ApiResponseEnvelope<T> {
    return ApiResponse.build<T>(statusCode, null, data, message, meta);
  }

  /**
   * Build a 201 Created response envelope.
   */
  public static created<T = unknown>(
    data: T = null as unknown as T,
    message: string = DEFAULT_CREATED_MESSAGE,
    meta: Record<string, unknown> = {},
  ): ApiResponseEnvelope<T> {
    return ApiResponse.build<T>(201, null, data, message, meta);
  }

  /**
   * Build a paginated 200 OK response envelope with `page`, `per_page`, and `total` in `meta`.
   */
  public static paginated<T = unknown>(
    items: T[],
    page: number,
    perPage: number,
    total: number,
    message: string = DEFAULT_SUCCESS_MESSAGE,
    meta: Record<string, unknown> = {},
  ): ApiResponseEnvelope<T[]> {
    return ApiResponse.build<T[]>(200, null, items, message, {
      page,
      per_page: perPage,
      total,
      ...meta,
    });
  }

  /**
   * Build an error response envelope from an `ErrorCode` or string error code.
   */
  public static error<T = unknown>(
    errorCode: ErrorCode | string,
    message?: string,
    statusCode?: number,
    data: T = null as unknown as T,
    meta: Record<string, unknown> = {},
  ): ApiResponseEnvelope<T> {
    const knownCode = Object.values(ErrorCode).includes(errorCode as ErrorCode)
      ? (errorCode as ErrorCode)
      : undefined;

    const resolvedStatusCode =
      statusCode ?? (knownCode ? getErrorCodeHttpStatus(knownCode) : 500);

    const trimmedMessage = message?.trim() ?? '';
    const resolvedMessage =
      trimmedMessage !== ''
        ? trimmedMessage
        : knownCode
          ? getErrorCodeDefaultMessage(knownCode)
          : getErrorCodeDefaultMessage(ErrorCode.INTERNAL_ERROR);

    return ApiResponse.build<T>(
      resolvedStatusCode,
      String(errorCode),
      data,
      resolvedMessage,
      meta,
    );
  }

  /**
   * Type guard checking if an object is already formatted as an `ApiResponseEnvelope`.
   */
  public static isEnvelope(value: unknown): value is ApiResponseEnvelope {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.statusCode === 'number' &&
      (typeof candidate.errorCode === 'string' || candidate.errorCode === null) &&
      'data' in candidate &&
      typeof candidate.message === 'string' &&
      typeof candidate.meta === 'object' &&
      candidate.meta !== null
    );
  }
}
