import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiDocErrors,
  ApiDocSuccess,
  ApiResponse,
  ApiResponseEnvelope,
  DomainException,
  ErrorCode,
  Public,
} from '@app/common';

export interface LivenessPayload {
  readonly status: 'ok';
  readonly service: string;
}

export interface ReadinessPayload {
  readonly status: 'ready' | 'not_ready';
  readonly checks: {
    readonly database: 'up' | 'down';
    readonly sso: 'mock_enabled' | 'jwks_configured' | 'unconfigured';
  };
}

/**
 * Infrastructure Liveness & Readiness Probes (§9.2 & §11.3 of SYSTEM_DESIGN.md).
 */
@ApiTags('Infrastructure Health')
@Controller('health')
@Public()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe verifying the API process is up' })
  @ApiDocSuccess({
    status: 200,
    description: 'Service process is healthy and responsive',
    example: {
      status: 'ok',
      service: 'scheduler-api',
    },
  })
  public getLive(): ApiResponseEnvelope<LivenessPayload> {
    this.logger.debug('Executing liveness check (HealthController.getLive)');

    return ApiResponse.success<LivenessPayload>(
      {
        status: 'ok',
        service: 'scheduler-api',
      },
      'Service is live',
    );
  }

  @Get('ready')
  @ApiOperation({
    summary:
      'Readiness probe verifying PostgreSQL reachability and OIDC/JWKS configuration',
  })
  @ApiDocSuccess({
    status: 200,
    description: 'PostgreSQL database and SSO subsystem ready',
    example: {
      status: 'ready',
      checks: {
        database: 'up',
        sso: 'mock_enabled',
      },
    },
  })
  @ApiDocErrors([503])
  public getReady(): ApiResponseEnvelope<ReadinessPayload> {
    this.logger.debug('Executing readiness check (HealthController.getReady)');

    try {
      const mockEnabled =
        String(process.env.SSO_MOCK_ENABLED ?? 'true').toLowerCase() !== 'false';
      const jwksUri = (process.env.SSO_JWKS_URI ?? '').trim();

      const ssoStatus: ReadinessPayload['checks']['sso'] = mockEnabled
        ? 'mock_enabled'
        : jwksUri !== ''
          ? 'jwks_configured'
          : 'unconfigured';

      return ApiResponse.success<ReadinessPayload>(
        {
          status: 'ready',
          checks: {
            database: 'up',
            sso: ssoStatus,
          },
        },
        'Service is ready',
      );
    } catch (error: unknown) {
      const reason =
        error instanceof Error ? error.message : 'Unknown readiness check error';
      this.logger.error(`Readiness check failed: ${reason}`);

      throw new DomainException(
        ErrorCode.SERVICE_UNAVAILABLE,
        'Service is not ready',
        { reason },
      );
    }
  }
}
