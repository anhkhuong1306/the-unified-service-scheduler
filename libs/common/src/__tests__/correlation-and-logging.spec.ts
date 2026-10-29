import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  CORRELATION_ID_HEADER,
  CORRELATION_ID_RESPONSE_HEADER,
} from '../context/request-context.interface';
import { RequestContextService } from '../context/request-context.service';
import {
  SLOT_REASON_NO_FREE_BAY,
  SlotUnavailableException,
  ValidationFailedException,
} from '../exceptions/domain.exception';
import {
  EVENT_REQUEST_END,
  EVENT_REQUEST_START,
  LoggingInterceptor,
} from '../interceptors/logging.interceptor';
import { MASKED_PLACEHOLDER } from '../logging/sensitive-data-masker';
import { CorrelationIdMiddleware } from '../middlewares/correlation-id.middleware';
import { ApiResponse } from '../responses/api-response';

describe('CorrelationIdMiddleware & LoggingInterceptor (§11.1 SYSTEM_DESIGN.md)', () => {
  const originalMaxBytesEnv = process.env.LOG_RESPONSE_MAX_BYTES;

  beforeEach(() => {
    RequestContextService.reset();
    delete process.env.LOG_RESPONSE_MAX_BYTES;
  });

  afterEach(() => {
    RequestContextService.reset();
    if (originalMaxBytesEnv === undefined) {
      delete process.env.LOG_RESPONSE_MAX_BYTES;
    } else {
      process.env.LOG_RESPONSE_MAX_BYTES = originalMaxBytesEnv;
    }
  });

  describe('CorrelationIdMiddleware & AsyncLocalStorage concurrency isolation', () => {
    it('preserves incoming x-correlation-id or generates a fresh UUID v4 and isolates concurrent requests via Promise.all', async () => {
      const middleware = new CorrelationIdMiddleware();

      // 1. Incoming header preserved
      const reqWithHeader = {
        headers: {
          [CORRELATION_ID_HEADER]: 'client-corr-id-777',
        },
      };
      const resHeaders1: Record<string, string> = {};
      const resWithHeader = {
        setHeader: (name: string, value: string) => {
          resHeaders1[name] = value;
        },
      };

      let capturedInside1 = '';
      middleware.use(reqWithHeader, resWithHeader, () => {
        capturedInside1 = RequestContextService.getCorrelationId();
      });

      expect(capturedInside1).toBe('client-corr-id-777');
      expect(resHeaders1[CORRELATION_ID_RESPONSE_HEADER]).toBe('client-corr-id-777');

      // 2. Missing header -> generates UUID v4
      const reqWithoutHeader = { headers: {} };
      const resHeaders2: Record<string, string> = {};
      const resWithoutHeader = {
        setHeader: (name: string, value: string) => {
          resHeaders2[name] = value;
        },
      };

      let capturedInside2 = '';
      middleware.use(reqWithoutHeader, resWithoutHeader, () => {
        capturedInside2 = RequestContextService.getCorrelationId();
      });

      expect(capturedInside2).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(resHeaders2[CORRELATION_ID_RESPONSE_HEADER]).toBe(capturedInside2);

      // 3. Concurrent requests on Node.js event loop via Promise.all must never bleed context
      const simulateConcurrentRequest = (
        index: number,
        delayMs: number,
      ): Promise<{ expected: string; beforeAwait: string; afterAwait: string }> =>
        new Promise((resolve) => {
          const expectedId = `concurrent-corr-${index}`;
          const req = { headers: { [CORRELATION_ID_HEADER]: expectedId } };
          const res = { setHeader: () => undefined };

          middleware.use(req, res, () => {
            RequestContextService.setActor({
              actorSub: `user-sub-${index}`,
              actorType: 'customer',
            });
            const beforeAwait = RequestContextService.getCorrelationId();

            setTimeout(() => {
              const afterAwait = RequestContextService.getCorrelationId();
              const afterSub = RequestContextService.getActorSub();
              resolve({
                expected: `${expectedId}:user-sub-${index}`,
                beforeAwait,
                afterAwait: `${afterAwait}:${afterSub}`,
              });
            }, delayMs);
          });
        });

      const concurrentResults = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          simulateConcurrentRequest(i + 1, (20 - i) % 7),
        ),
      );

      for (const item of concurrentResults) {
        expect(item.afterAwait).toBe(item.expected);
      }
    });
  });

  describe('LoggingInterceptor boundary logs (REQUEST_START & REQUEST_END)', () => {
    it('logs REQUEST_START and REQUEST_END with full masked response body on 200 OK success', async () => {
      const emittedLogs: Array<{ event: string; payload: Record<string, unknown> }> = [];
      const interceptor = new LoggingInterceptor((event, payload) => {
        emittedLogs.push({ event, payload });
      });

      const mockRequest = {
        method: 'POST',
        route: { path: '/v1/appointments' },
        headers: {
          'x-correlation-id': 'corr-log-200',
          'x-client-platform': 'dealer-web',
        },
        body: {
          dealership_id: 1,
          service_type_id: 2,
          start_at: '2026-11-01T09:00:00Z',
          customer_name: 'John Customer',
          email: 'john.customer@example.com',
          phone: '+84909111222',
          vin: '1HGCM82633A004352',
          access_token: 'secret-bearer-token',
        },
      };

      const mockResponse = {
        statusCode: 200,
        locals: {},
      };

      const mockContext = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
      } as unknown as ExecutionContext;

      const responseEnvelope = ApiResponse.success({
        id: 'apt-001',
        reference_code: 'APT-20261101-0001',
        dealership_id: 1,
        status: 'CONFIRMED',
        customer_name: 'John Customer',
        vehicle_vin: '1HGCM82633A004352',
        customer_email: 'john.customer@example.com',
      });

      const next: CallHandler = {
        handle: () => of(responseEnvelope),
      };

      await RequestContextService.run(
        {
          correlationId: 'corr-log-200',
          actorSub: 'aaaa1111-bbbb-4ccc-8ddd-eeeeffff0000',
          actorType: 'customer',
        },
        async () => {
          await firstValueFrom(interceptor.intercept(mockContext, next));
        },
      );

      expect(emittedLogs).toHaveLength(2);

      const startLog = emittedLogs[0].payload;
      expect(startLog.event).toBe(EVENT_REQUEST_START);
      expect(startLog.correlation_id).toBe('corr-log-200');
      expect(startLog.method).toBe('POST');
      expect(startLog.route).toBe('/v1/appointments');
      expect(startLog.user_id).toBe('aaaa1111-bbbb-4ccc-8ddd-eeeeffff0000');
      expect(startLog.actor_type).toBe('customer');
      expect(startLog.platform).toBe('dealer-web');

      const maskedReqPayload = startLog.payload as Record<string, unknown>;
      expect(maskedReqPayload.dealership_id).toBe(1);
      expect(maskedReqPayload.customer_name).toBe('J*** C***');
      expect(maskedReqPayload.email).toBe('j***@example.com');
      expect(String(maskedReqPayload.phone).endsWith('222')).toBe(true);
      expect(maskedReqPayload.vin).toBe('*************4352');
      expect(maskedReqPayload.access_token).toBe(MASKED_PLACEHOLDER);

      const endLog = emittedLogs[1].payload;
      expect(endLog.event).toBe(EVENT_REQUEST_END);
      expect(endLog.correlation_id).toBe('corr-log-200');
      expect(endLog.status).toBe(200);
      expect(endLog.errorCode).toBeNull();
      expect(typeof endLog.duration_ms).toBe('number');
      expect(Number(endLog.heap_used_bytes)).toBeGreaterThan(0);
      expect(endLog.exception).toBeNull();

      const loggedResponse = endLog.response as Record<string, unknown>;
      const loggedData = loggedResponse.data as Record<string, unknown>;
      expect(loggedResponse.statusCode).toBe(200);
      expect(loggedResponse.errorCode).toBeNull();
      expect(loggedData.reference_code).toBe('APT-20261101-0001');
      expect(loggedData.status).toBe('CONFIRMED');
      expect(loggedData.customer_name).toBe('J*** C***');
      expect(loggedData.vehicle_vin).toBe('*************4352');
      expect(loggedData.customer_email).toBe('j***@example.com');
    });

    it('logs full masked error response body and exception metadata on 409 Conflict and 422 ValidationFailedException, and supports LOG_RESPONSE_MAX_BYTES truncation', async () => {
      const emittedLogs: Array<{ event: string; payload: Record<string, unknown> }> = [];
      const interceptor = new LoggingInterceptor((event, payload) => {
        emittedLogs.push({ event, payload });
      });

      const mockRequest = {
        method: 'POST',
        route: { path: '/v1/appointments' },
        headers: { 'x-correlation-id': 'corr-log-409' },
        body: { dealership_id: 1, service_type_id: 3 },
      };

      const mockResponse = { statusCode: 409, locals: {} };
      const mockContext = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
      } as unknown as ExecutionContext;

      const slotError = SlotUnavailableException.withAlternatives(
        SLOT_REASON_NO_FREE_BAY,
        [{ start_at: '2026-11-01T10:00:00Z', end_at: '2026-11-01T11:45:00Z' }],
        'No service bay available for 09:00.',
      );

      await RequestContextService.run({ correlationId: 'corr-log-409' }, async () => {
        await expect(
          firstValueFrom(
            interceptor.intercept(mockContext, {
              handle: () => throwError(() => slotError),
            }),
          ),
        ).rejects.toThrow(SlotUnavailableException);
      });

      expect(emittedLogs).toHaveLength(2);
      const conflictEndLog = emittedLogs[1].payload;
      const conflictResp = conflictEndLog.response as Record<string, unknown>;
      const conflictData = conflictResp.data as Record<string, unknown>;

      expect(conflictEndLog.status).toBe(409);
      expect(conflictEndLog.errorCode).toBe('SLOT_UNAVAILABLE');
      expect(conflictResp.statusCode).toBe(409);
      expect(conflictResp.errorCode).toBe('SLOT_UNAVAILABLE');
      expect(conflictData.reason).toBe('NO_FREE_BAY');
      expect(conflictData.alternatives).toHaveLength(1);
      expect(conflictEndLog.exception).toMatchObject({
        class: 'SlotUnavailableException',
        message: 'No service bay available for 09:00.',
      });

      // 422 ValidationFailedException + LOG_RESPONSE_MAX_BYTES cap verification
      emittedLogs.length = 0;
      const validationError = new ValidationFailedException(
        'Validation failed for booking payload',
        {
          errors: ['start_at must align with 30-minute grid'],
          customer_name: 'Sensitive Customer',
        },
      );

      await RequestContextService.run({ correlationId: 'corr-log-422' }, async () => {
        await expect(
          firstValueFrom(
            interceptor.intercept(mockContext, {
              handle: () => throwError(() => validationError),
            }),
          ),
        ).rejects.toThrow(ValidationFailedException);
      });

      const validationEndLog = emittedLogs[1].payload;
      const validationResp = validationEndLog.response as Record<string, unknown>;
      const validationData = validationResp.data as Record<string, unknown>;

      expect(validationEndLog.status).toBe(422);
      expect(validationEndLog.errorCode).toBe('VALIDATION_FAILED');
      expect(validationData.customer_name).toBe('S*** C***');

      // Verify LOG_RESPONSE_MAX_BYTES cap
      process.env.LOG_RESPONSE_MAX_BYTES = '48';
      const truncatedEndPayload = LoggingInterceptor.buildRequestEndPayload(
        200,
        ApiResponse.success({
          customer_name: 'John Customer',
          notes: 'A long response payload exceeding forty-eight bytes cap',
        }),
        5.5,
      );

      expect(truncatedEndPayload.response).toMatchObject({
        truncated: true,
        max_bytes: 48,
      });
    });
  });
});
