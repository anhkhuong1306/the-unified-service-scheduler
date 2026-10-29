import { RequestContextService } from '../context/request-context.service';
import {
  MASKED_PLACEHOLDER,
  SensitiveDataMasker,
} from './sensitive-data-masker';

export const DEFAULT_LOG_LEVEL = 'info';
export const DEFAULT_SERVICE_NAME = 'scheduler-service';

export const PINO_REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.password_confirmation',
  '*.client_secret',
  '*.access_token',
  '*.refresh_token',
  '*.authorization',
  '*.secret',
  '*.token',
];

/**
 * Build Pino logger configuration for `nestjs-pino` / `pino` (§11.1 of SYSTEM_DESIGN.md).
 *
 * Automatically injects `correlation_id` from `AsyncLocalStorage` into every JSON log line
 * via `mixin()` and enforces sensitive-data redaction.
 */
export function createPinoLoggerOptions(
  serviceName: string = process.env.SERVICE_NAME ?? DEFAULT_SERVICE_NAME,
): Record<string, unknown> {
  const level = process.env.LOG_LEVEL?.trim() || DEFAULT_LOG_LEVEL;

  return {
    name: serviceName,
    level,
    timestamp: true,
    mixin(): { correlation_id: string } {
      return {
        correlation_id: RequestContextService.getCorrelationId(),
      };
    },
    redact: {
      paths: PINO_REDACT_PATHS,
      censor: MASKED_PLACEHOLDER,
    },
    serializers: {
      req(req: Record<string, unknown>): Record<string, unknown> {
        return SensitiveDataMasker.maskData(req);
      },
      res(res: Record<string, unknown>): Record<string, unknown> {
        return SensitiveDataMasker.maskData(res);
      },
    },
  };
}
