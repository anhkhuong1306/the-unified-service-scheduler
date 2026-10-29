import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  CLIENT_PLATFORM_HEADER,
  CORRELATION_ID_HEADER,
  DEFAULT_CLIENT_PLATFORM,
} from '../context/request-context.interface';
import { RequestContextService } from '../context/request-context.service';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import { SensitiveDataMasker } from '../logging/sensitive-data-masker';
import { ApiResponse } from '../responses/api-response';
import {
  ENVELOPE_LOCALS_KEY,
  EXCEPTION_META_LOCALS_KEY,
} from './response-envelope.interceptor';

export const EVENT_REQUEST_START = 'REQUEST_START';
export const EVENT_REQUEST_END = 'REQUEST_END';

export type LogSinkCallback = (
  event: string,
  payload: Record<string, unknown>,
) => void;

export interface RequestStartLogPayload {
  event: typeof EVENT_REQUEST_START;
  correlation_id: string;
  method: string;
  route: string;
  user_id: string | null;
  actor_type: string;
  platform: string;
  payload: unknown;
}

export interface RequestEndLogPayload {
  event: typeof EVENT_REQUEST_END;
  correlation_id: string;
  status: number;
  errorCode: string | null;
  duration_ms: number;
  heap_used_bytes: number;
  response: unknown;
  exception: Record<string, unknown> | null;
}

/**
 * Emits structured `REQUEST_START` and `REQUEST_END` boundary logs (§11.1 of SYSTEM_DESIGN.md).
 *
 * Logs the **full masked response body for BOTH success (2xx) and error (4xx/5xx)** responses,
 * with optional byte-cap truncation controlled via `LOG_RESPONSE_MAX_BYTES`.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  public constructor(@Optional() private readonly customSink?: LogSinkCallback) {}

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      route?: { path?: string };
      headers?: Record<string, string | string[] | undefined>;
      body?: unknown;
      query?: Record<string, unknown>;
      params?: Record<string, unknown>;
    }>();
    const response = httpContext.getResponse<{
      statusCode?: number;
      locals?: Record<string, unknown>;
    }>();

    const incomingCorrelationHeader = request?.headers?.[CORRELATION_ID_HEADER];
    const incomingCorrelationId = Array.isArray(incomingCorrelationHeader)
      ? incomingCorrelationHeader[0]
      : incomingCorrelationHeader;
    if (incomingCorrelationId && incomingCorrelationId.trim() !== '') {
      RequestContextService.setCorrelationId(incomingCorrelationId.trim());
    }

    const startPayload = LoggingInterceptor.buildRequestStartPayload(request);
    this.emitLog(EVENT_REQUEST_START, startPayload as unknown as Record<string, unknown>);

    const startTimeMs = performance.now();

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        const durationMs = Number((performance.now() - startTimeMs).toFixed(3));
        const statusCode =
          typeof response?.statusCode === 'number' && response.statusCode >= 100
            ? response.statusCode
            : 200;

        const storedEnvelope = response?.locals?.[ENVELOPE_LOCALS_KEY];
        const effectiveResponse =
          storedEnvelope !== undefined
            ? storedEnvelope
            : ApiResponse.isEnvelope(responseBody)
              ? responseBody
              : ApiResponse.build(statusCode, null, responseBody ?? null, 'OK');

        const endPayload = LoggingInterceptor.buildRequestEndPayload(
          statusCode,
          effectiveResponse,
          durationMs,
          null,
        );

        this.emitLog(EVENT_REQUEST_END, endPayload as unknown as Record<string, unknown>);
      }),
      catchError((error: unknown) => {
        const durationMs = Number((performance.now() - startTimeMs).toFixed(3));
        const { statusCode, envelope, exceptionMeta } =
          GlobalExceptionFilter.toEnvelope(error);

        if (response) {
          response.locals = response.locals ?? {};
          response.locals[ENVELOPE_LOCALS_KEY] = envelope;
          response.locals[EXCEPTION_META_LOCALS_KEY] = exceptionMeta;
        }

        const endPayload = LoggingInterceptor.buildRequestEndPayload(
          statusCode,
          envelope,
          durationMs,
          exceptionMeta,
        );

        this.emitLog(EVENT_REQUEST_END, endPayload as unknown as Record<string, unknown>);

        return throwError(() => error);
      }),
    );
  }

  /**
   * Build the structured `REQUEST_START` log payload with masked request inputs.
   */
  public static buildRequestStartPayload(request: {
    method?: string;
    originalUrl?: string;
    url?: string;
    route?: { path?: string };
    headers?: Record<string, string | string[] | undefined>;
    body?: unknown;
    query?: Record<string, unknown>;
    params?: Record<string, unknown>;
  }): RequestStartLogPayload {
    const correlationId = RequestContextService.getCorrelationId();
    const method = request?.method ?? 'GET';
    const route =
      request?.route?.path ?? request?.originalUrl ?? request?.url ?? '/';

    const rawPlatform = request?.headers?.[CLIENT_PLATFORM_HEADER];
    const platformStr = Array.isArray(rawPlatform) ? rawPlatform[0] : rawPlatform;
    const platform =
      platformStr && platformStr.trim() !== ''
        ? platformStr.trim()
        : DEFAULT_CLIENT_PLATFORM;

    const combinedPayload =
      request?.body !== undefined &&
      request?.body !== null &&
      typeof request.body === 'object' &&
      Object.keys(request.body as Record<string, unknown>).length > 0
        ? request.body
        : request?.query && Object.keys(request.query).length > 0
          ? request.query
          : request?.body ?? {};

    return {
      event: EVENT_REQUEST_START,
      correlation_id: correlationId,
      method,
      route,
      user_id: RequestContextService.getActorSub(),
      actor_type: RequestContextService.getActorType(),
      platform,
      payload: SensitiveDataMasker.maskData(combinedPayload),
    };
  }

  /**
   * Build the structured `REQUEST_END` log payload with the full masked response body
   * (for both 2xx and 4xx/5xx), respecting `LOG_RESPONSE_MAX_BYTES` if configured (> 0).
   */
  public static buildRequestEndPayload(
    statusCode: number,
    rawResponseBody: unknown,
    durationMs: number,
    exceptionMeta: Record<string, unknown> | null = null,
  ): RequestEndLogPayload {
    const correlationId = RequestContextService.getCorrelationId();
    const errorCode = LoggingInterceptor.extractErrorCode(rawResponseBody);
    const maskedResponse = LoggingInterceptor.formatMaskedResponse(rawResponseBody);
    const heapUsedBytes = process.memoryUsage().heapUsed;

    return {
      event: EVENT_REQUEST_END,
      correlation_id: correlationId,
      status: statusCode,
      errorCode,
      duration_ms: Number(durationMs.toFixed(3)),
      heap_used_bytes: heapUsedBytes,
      response: maskedResponse,
      exception: exceptionMeta
        ? (SensitiveDataMasker.maskData(exceptionMeta) as Record<string, unknown>)
        : null,
    };
  }

  private static extractErrorCode(responseBody: unknown): string | null {
    if (typeof responseBody === 'object' && responseBody !== null) {
      const candidate = responseBody as Record<string, unknown>;
      if (typeof candidate.errorCode === 'string') {
        return candidate.errorCode;
      }
    }
    return null;
  }

  private static formatMaskedResponse(rawResponseBody: unknown): unknown {
    const masked = SensitiveDataMasker.maskData(rawResponseBody);
    const maxBytes = LoggingInterceptor.resolveMaxResponseBytes();

    if (maxBytes <= 0) {
      return masked;
    }

    const serialized =
      typeof masked === 'string' ? masked : JSON.stringify(masked ?? null);
    const byteLength = Buffer.byteLength(serialized, 'utf8');

    if (byteLength <= maxBytes) {
      return masked;
    }

    return {
      truncated: true,
      max_bytes: maxBytes,
      original_bytes: byteLength,
      body_preview: Buffer.from(serialized, 'utf8')
        .subarray(0, maxBytes)
        .toString('utf8'),
    };
  }

  private static resolveMaxResponseBytes(): number {
    const rawEnv = process.env.LOG_RESPONSE_MAX_BYTES;
    if (!rawEnv || rawEnv.trim() === '') {
      return 0;
    }

    const parsed = Number.parseInt(rawEnv.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private emitLog(event: string, payload: Record<string, unknown>): void {
    if (this.customSink) {
      this.customSink(event, payload);
      return;
    }

    this.logger.log(payload);
  }
}
