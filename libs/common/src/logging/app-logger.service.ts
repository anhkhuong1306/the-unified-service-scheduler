import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';

/**
 * Custom application logger extending NestJS ConsoleLogger.
 *
 * Injects `[<correlation_id>]` immediately following the formatted timestamp
 * when an active HTTP request context is running in AsyncLocalStorage.
 *
 * @example
 * `[Nest] 44  - 10/30/2026, 3:45:26 PM [cbf7950c-d6cf-4a5c-8aaf-b5eb77d735db]     LOG [LoggingInterceptor] ...`
 */
@Injectable()
export class AppLogger extends ConsoleLogger {
  protected override formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    const output = this.stringifyMessage(message, logLevel);
    pidMessage = this.colorize(pidMessage, logLevel);
    formattedLogLevel = this.colorize(formattedLogLevel, logLevel);

    const correlationId = RequestContextService.getActiveCorrelationId();
    const correlationPart = correlationId ? ` [${correlationId}]` : '';

    return `${pidMessage}${this.getTimestamp()}${correlationPart} ${formattedLogLevel} ${contextMessage}${output}${timestampDiff}\n`;
  }
}
