import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import {
  CORRELATION_ID_HEADER,
  CORRELATION_ID_RESPONSE_HEADER,
  DEFAULT_ACTOR_TYPE,
} from '../context/request-context.interface';
import { RequestContextService } from '../context/request-context.service';

/**
 * Initializes the per-request `AsyncLocalStorage` store with the incoming `X-Correlation-ID`
 * header (or a freshly generated UUID v4) and attaches `X-Correlation-ID` to the response (§11.1).
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  public use(
    req: {
      headers?: Record<string, string | string[] | undefined>;
    },
    res: {
      setHeader?: (name: string, value: string) => void;
    },
    next: () => void,
  ): void {
    const rawHeader = req?.headers?.[CORRELATION_ID_HEADER];
    const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const trimmed = headerValue?.trim() ?? '';
    const correlationId = trimmed !== '' ? trimmed : randomUUID();

    if (req?.headers) {
      req.headers[CORRELATION_ID_HEADER] = correlationId;
    }

    if (typeof res?.setHeader === 'function') {
      res.setHeader(CORRELATION_ID_RESPONSE_HEADER, correlationId);
    }

    RequestContextService.run(
      {
        correlationId,
        actorSub: null,
        actorType: DEFAULT_ACTOR_TYPE,
        tenantId: null,
        dealershipId: null,
        roles: [],
      },
      () => {
        next();
      },
    );
  }
}
