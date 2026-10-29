import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { CORRELATION_ID_RESPONSE_HEADER } from '../context/request-context.interface';
import { RequestContextService } from '../context/request-context.service';
import {
  ErrorCode,
  getErrorCodeDefaultMessage,
  getErrorCodeHttpStatus,
} from '../enums/error-code.enum';
import {
  IdempotencyInProgressException,
  IdempotencyKeyReusedException,
  SLOT_REASON_NO_QUALIFIED_TECHNICIAN,
  SlotSwapConflictException,
  SlotUnavailableException,
  VersionConflictException,
} from '../exceptions/domain.exception';
import { GlobalExceptionFilter } from '../filters/global-exception.filter';
import {
  ENVELOPE_LOCALS_KEY,
  ResponseEnvelopeInterceptor,
} from '../interceptors/response-envelope.interceptor';
import { ApiResponse } from '../responses/api-response';

describe('ErrorCode, ApiResponse, ResponseEnvelopeInterceptor & GlobalExceptionFilter (§9.1 & §8 SYSTEM_DESIGN.md)', () => {
  beforeEach(() => {
    RequestContextService.reset();
  });

  afterEach(() => {
    RequestContextService.reset();
  });

  describe('ErrorCode enum & HTTP status mapping (§9.1)', () => {
    it('defines all 19 error codes matching §9.1 with exact HTTP status codes and non-empty default messages', () => {
      const expectedErrorCodes: Array<[ErrorCode, string, number]> = [
        [ErrorCode.UNAUTHENTICATED, 'UNAUTHENTICATED', 401],
        [ErrorCode.FORBIDDEN, 'FORBIDDEN', 403],
        [ErrorCode.NOT_FOUND, 'NOT_FOUND', 404],
        [ErrorCode.VALIDATION_FAILED, 'VALIDATION_FAILED', 422],
        [ErrorCode.SLOT_UNAVAILABLE, 'SLOT_UNAVAILABLE', 409],
        [ErrorCode.DEALERSHIP_FULLY_BOOKED, 'DEALERSHIP_FULLY_BOOKED', 409],
        [ErrorCode.TECHNICIAN_UNAVAILABLE, 'TECHNICIAN_UNAVAILABLE', 409],
        [ErrorCode.BAY_UNAVAILABLE, 'BAY_UNAVAILABLE', 409],
        [ErrorCode.VEHICLE_ALREADY_BOOKED, 'VEHICLE_ALREADY_BOOKED', 409],
        [ErrorCode.SLOT_SWAP_CONFLICT, 'SLOT_SWAP_CONFLICT', 409],
        [ErrorCode.ACTIVE_APPOINTMENT_LIMIT_REACHED, 'ACTIVE_APPOINTMENT_LIMIT_REACHED', 409],
        [ErrorCode.INVALID_STATE_TRANSITION, 'INVALID_STATE_TRANSITION', 409],
        [ErrorCode.VERSION_CONFLICT, 'VERSION_CONFLICT', 409],
        [ErrorCode.PRECONDITION_REQUIRED, 'PRECONDITION_REQUIRED', 428],
        [ErrorCode.IDEMPOTENCY_IN_PROGRESS, 'IDEMPOTENCY_IN_PROGRESS', 409],
        [ErrorCode.IDEMPOTENCY_KEY_REUSED, 'IDEMPOTENCY_KEY_REUSED', 422],
        [ErrorCode.TOO_MANY_REQUESTS, 'TOO_MANY_REQUESTS', 429],
        [ErrorCode.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 503],
        [ErrorCode.INTERNAL_ERROR, 'INTERNAL_ERROR', 500],
      ];

      expect(Object.values(ErrorCode)).toHaveLength(19);

      for (const [code, stringValue, expectedStatus] of expectedErrorCodes) {
        expect(code).toBe(stringValue);
        expect(getErrorCodeHttpStatus(code)).toBe(expectedStatus);
        expect(getErrorCodeDefaultMessage(code).length).toBeGreaterThan(0);
      }
    });
  });

  describe('ApiResponse unified envelope builders & ResponseEnvelopeInterceptor', () => {
    it('builds success(), created(), paginated(), and error() envelopes with meta.correlation_id', () => {
      RequestContextService.run({ correlationId: 'corr-env-001' }, () => {
        const successEnvelope = ApiResponse.success(
          { appointment_id: 'apt-001', status: 'CONFIRMED' },
          'Appointment retrieved',
        );

        expect(successEnvelope).toEqual({
          statusCode: 200,
          errorCode: null,
          data: { appointment_id: 'apt-001', status: 'CONFIRMED' },
          message: 'Appointment retrieved',
          meta: {
            correlation_id: 'corr-env-001',
          },
        });

        const createdEnvelope = ApiResponse.created(
          { id: 'apt-002', status: 'PENDING' },
          'Appointment created',
        );

        expect(createdEnvelope).toEqual({
          statusCode: 201,
          errorCode: null,
          data: { id: 'apt-002', status: 'PENDING' },
          message: 'Appointment created',
          meta: {
            correlation_id: 'corr-env-001',
          },
        });

        const paginatedEnvelope = ApiResponse.paginated(
          [{ id: 1, name: 'Dealership A' }],
          2,
          20,
          45,
          'Dealerships listed',
        );

        expect(paginatedEnvelope).toEqual({
          statusCode: 200,
          errorCode: null,
          data: [{ id: 1, name: 'Dealership A' }],
          message: 'Dealerships listed',
          meta: {
            page: 2,
            per_page: 20,
            total: 45,
            correlation_id: 'corr-env-001',
          },
        });

        const errorEnvelope = ApiResponse.error(
          ErrorCode.DEALERSHIP_FULLY_BOOKED,
          undefined,
          undefined,
          { reason: 'NO_QUALIFIED_TECHNICIAN', alternatives: [] },
        );

        expect(errorEnvelope).toEqual({
          statusCode: 409,
          errorCode: 'DEALERSHIP_FULLY_BOOKED',
          data: { reason: 'NO_QUALIFIED_TECHNICIAN', alternatives: [] },
          message: getErrorCodeDefaultMessage(ErrorCode.DEALERSHIP_FULLY_BOOKED),
          meta: {
            correlation_id: 'corr-env-001',
          },
        });
      });
    });

    it('wraps raw controller payload in ResponseEnvelopeInterceptor and attaches X-Correlation-ID header', async () => {
      const interceptor = new ResponseEnvelopeInterceptor();
      const headers: Record<string, string> = {};
      const mockResponse: {
        statusCode: number;
        locals: Record<string, unknown>;
        setHeader: (name: string, value: string) => void;
        status: (code: number) => void;
      } = {
        statusCode: 201,
        locals: {},
        setHeader: (name: string, value: string) => {
          headers[name] = value;
        },
        status: (code: number) => {
          mockResponse.statusCode = code;
        },
      };

      const mockContext = {
        getType: () => 'http',
        switchToHttp: () => ({
          getResponse: () => mockResponse,
        }),
      } as unknown as ExecutionContext;

      const next: CallHandler = {
        handle: () => of({ id: 'apt-999', status: 'CONFIRMED' }),
      };

      await RequestContextService.run(
        { correlationId: 'corr-interceptor-201' },
        async () => {
          const result = await firstValueFrom(interceptor.intercept(mockContext, next));

          expect(headers[CORRELATION_ID_RESPONSE_HEADER]).toBe('corr-interceptor-201');
          expect(result).toEqual({
            statusCode: 201,
            errorCode: null,
            data: { id: 'apt-999', status: 'CONFIRMED' },
            message: 'Created',
            meta: {
              correlation_id: 'corr-interceptor-201',
            },
          });
          expect(mockResponse.locals[ENVELOPE_LOCALS_KEY]).toEqual(result);
        },
      );
    });
  });

  describe('GlobalExceptionFilter.toEnvelope() mapping (§9.1 & §8)', () => {
    it('maps SlotUnavailableException.withAlternatives, SlotSwapConflictException, VersionConflictException, IdempotencyInProgressException & IdempotencyKeyReusedException', () => {
      RequestContextService.run({ correlationId: 'corr-domain-409' }, () => {
        const alternatives = [
          { start_at: '2026-11-01T10:00:00Z', end_at: '2026-11-01T10:45:00Z' },
          { start_at: '2026-11-01T11:00:00Z', end_at: '2026-11-01T11:45:00Z' },
        ];
        const slotEx = SlotUnavailableException.withAlternatives(
          SLOT_REASON_NO_QUALIFIED_TECHNICIAN,
          alternatives,
          'No EV technician available for the requested slot.',
        );

        const slotMapped = GlobalExceptionFilter.toEnvelope(slotEx);
        expect(slotMapped.statusCode).toBe(409);
        expect(slotMapped.envelope).toEqual({
          statusCode: 409,
          errorCode: 'SLOT_UNAVAILABLE',
          data: {
            reason: 'NO_QUALIFIED_TECHNICIAN',
            alternatives,
          },
          message: 'No EV technician available for the requested slot.',
          meta: {
            correlation_id: 'corr-domain-409',
          },
        });

        const swapEx = new SlotSwapConflictException(
          'Longer duration collides with adjacent appointment on Bay 3.',
          { conflicting_resource: 'service_bay_id', service_bay_id: 3 },
        );
        const swapMapped = GlobalExceptionFilter.toEnvelope(swapEx);
        expect(swapMapped.statusCode).toBe(409);
        expect(swapMapped.envelope.errorCode).toBe('SLOT_SWAP_CONFLICT');
        expect(swapMapped.envelope.data).toEqual({
          conflicting_resource: 'service_bay_id',
          service_bay_id: 3,
        });

        const versionEx = new VersionConflictException('Stale version 1 vs current 2', {
          expected_version: 1,
          current_version: 2,
        });
        const versionMapped = GlobalExceptionFilter.toEnvelope(versionEx);
        expect(versionMapped.statusCode).toBe(409);
        expect(versionMapped.envelope.errorCode).toBe('VERSION_CONFLICT');

        const idemInProgressMapped = GlobalExceptionFilter.toEnvelope(
          new IdempotencyInProgressException(),
        );
        expect(idemInProgressMapped.statusCode).toBe(409);
        expect(idemInProgressMapped.envelope.errorCode).toBe('IDEMPOTENCY_IN_PROGRESS');

        const idemReusedMapped = GlobalExceptionFilter.toEnvelope(
          new IdempotencyKeyReusedException(),
        );
        expect(idemReusedMapped.statusCode).toBe(422);
        expect(idemReusedMapped.envelope.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
      });
    });

    it('maps NestJS HttpExceptions, PostgreSQL 23P01/55P03 SQLSTATEs, and hides internal details on 500 INTERNAL_ERROR', () => {
      RequestContextService.run({ correlationId: 'corr-pg-and-http' }, () => {
        const badReqMapped = GlobalExceptionFilter.toEnvelope(
          new BadRequestException(['start_at must align with 30m grid']),
        );
        expect(badReqMapped.statusCode).toBe(422);
        expect(badReqMapped.envelope.errorCode).toBe('VALIDATION_FAILED');
        expect(badReqMapped.envelope.data).toEqual({
          errors: ['start_at must align with 30m grid'],
        });

        const unauthMapped = GlobalExceptionFilter.toEnvelope(
          new UnauthorizedException('Expired JWT token'),
        );
        expect(unauthMapped.statusCode).toBe(401);
        expect(unauthMapped.envelope.errorCode).toBe('UNAUTHENTICATED');

        const forbiddenMapped = GlobalExceptionFilter.toEnvelope(
          new ForbiddenException('Staff dealership mismatch'),
        );
        expect(forbiddenMapped.statusCode).toBe(403);
        expect(forbiddenMapped.envelope.errorCode).toBe('FORBIDDEN');

        const notFoundMapped = GlobalExceptionFilter.toEnvelope(
          new NotFoundException('Appointment not found'),
        );
        expect(notFoundMapped.statusCode).toBe(404);
        expect(notFoundMapped.envelope.errorCode).toBe('NOT_FOUND');

        // PostgreSQL 23P01 exclusion constraints
        const vehicleOverlapMapped = GlobalExceptionFilter.toEnvelope({
          code: '23P01',
          constraint: 'no_vehicle_overlap',
          message: 'conflicting key value violates exclusion constraint "no_vehicle_overlap"',
        });
        expect(vehicleOverlapMapped.statusCode).toBe(409);
        expect(vehicleOverlapMapped.envelope.errorCode).toBe('VEHICLE_ALREADY_BOOKED');

        const techOverlapMapped = GlobalExceptionFilter.toEnvelope({
          driverError: {
            code: '23P01',
            constraint: 'no_technician_overlap',
          },
        });
        expect(techOverlapMapped.statusCode).toBe(409);
        expect(techOverlapMapped.envelope.errorCode).toBe('TECHNICIAN_UNAVAILABLE');

        const bayOverlapMapped = GlobalExceptionFilter.toEnvelope({
          code: '23P01',
          constraint: 'no_bay_overlap',
        });
        expect(bayOverlapMapped.statusCode).toBe(409);
        expect(bayOverlapMapped.envelope.errorCode).toBe('BAY_UNAVAILABLE');

        // PostgreSQL 55P03 lock timeout
        const lockTimeoutMapped = GlobalExceptionFilter.toEnvelope({
          code: '55P03',
          message: 'canceling statement due to lock timeout',
        });
        expect(lockTimeoutMapped.statusCode).toBe(503);
        expect(lockTimeoutMapped.envelope.errorCode).toBe('SERVICE_UNAVAILABLE');

        // Generic runtime error -> 500 INTERNAL_ERROR without leaking sensitive message
        const internalMapped = GlobalExceptionFilter.toEnvelope(
          new Error('Database connection string password=supersecret leaked'),
        );
        expect(internalMapped.statusCode).toBe(500);
        expect(internalMapped.envelope.errorCode).toBe('INTERNAL_ERROR');
        expect(internalMapped.envelope.message).toBe(
          getErrorCodeDefaultMessage(ErrorCode.INTERNAL_ERROR),
        );
        expect(internalMapped.envelope.message).not.toContain('supersecret');
        expect(internalMapped.exceptionMeta.class).toBe('Error');
      });
    });
  });
});
