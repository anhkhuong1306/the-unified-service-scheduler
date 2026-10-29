import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CORRELATION_ID_RESPONSE_HEADER } from '../context/request-context.interface';
import { RequestContextService } from '../context/request-context.service';
import {
  ApiResponse,
  ApiResponseEnvelope,
  DEFAULT_CREATED_MESSAGE,
  DEFAULT_SUCCESS_MESSAGE,
} from '../responses/api-response';

export const ENVELOPE_LOCALS_KEY = '__envelopeResponse';
export const EXCEPTION_META_LOCALS_KEY = '__exceptionMeta';

/**
 * Wraps all 2xx controller return values into the unified `ApiResponseEnvelope` (§9.1),
 * attaches the `X-Correlation-ID` header, and stores the envelope in `response.locals`
 * so `LoggingInterceptor` can log the exact serialized body.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<{
      statusCode?: number;
      status?: (code: number) => unknown;
      setHeader?: (name: string, value: string) => void;
      locals?: Record<string, unknown>;
    }>();

    return next.handle().pipe(
      map((body: unknown): ApiResponseEnvelope => {
        const correlationId = RequestContextService.getCorrelationId();

        if (typeof response?.setHeader === 'function') {
          response.setHeader(CORRELATION_ID_RESPONSE_HEADER, correlationId);
        }

        let envelope: ApiResponseEnvelope;

        if (ApiResponse.isEnvelope(body)) {
          envelope = ApiResponse.build(
            body.statusCode,
            body.errorCode,
            body.data,
            body.message,
            {
              ...body.meta,
              correlation_id: correlationId,
            },
          );
          if (typeof response?.status === 'function') {
            response.status(envelope.statusCode);
          }
        } else {
          const statusCode =
            typeof response?.statusCode === 'number' && response.statusCode >= 100
              ? response.statusCode
              : 200;
          const defaultMessage =
            statusCode === 201 ? DEFAULT_CREATED_MESSAGE : DEFAULT_SUCCESS_MESSAGE;

          envelope = ApiResponse.build(
            statusCode,
            null,
            body ?? null,
            defaultMessage,
            { correlation_id: correlationId },
          );
        }

        if (response) {
          response.locals = response.locals ?? {};
          response.locals[ENVELOPE_LOCALS_KEY] = envelope;
        }

        return envelope;
      }),
    );
  }
}
