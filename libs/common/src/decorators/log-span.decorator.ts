import { Logger } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';
import { SensitiveDataMasker } from '../logging/sensitive-data-masker';

export const EVENT_SPAN = 'SPAN';

export interface SpanLogPayload {
  event: typeof EVENT_SPAN;
  correlation_id: string;
  class: string;
  function: string;
  input: unknown;
  output: unknown;
  duration_ms: number | null;
}

export type SpanSinkCallback = (payload: SpanLogPayload) => void;

/**
 * Structured span logger for UseCases, Services, and StateMachine transitions (§11.1 of SYSTEM_DESIGN.md).
 */
export class SpanLogger {
  private static readonly logger = new Logger(SpanLogger.name);
  private static customSink: SpanSinkCallback | null = null;

  /**
   * Register an optional custom sink (useful in unit tests to inspect emitted span records).
   */
  public static setSink(sink: SpanSinkCallback | null): void {
    SpanLogger.customSink = sink;
  }

  /**
   * Emit a structured `SPAN` log entry with masked `input` and `output` payloads.
   */
  public static log(
    className: string,
    functionName: string,
    input: unknown = null,
    output: unknown = null,
    durationMs?: number,
  ): SpanLogPayload {
    const payload: SpanLogPayload = {
      event: EVENT_SPAN,
      correlation_id: RequestContextService.getCorrelationId(),
      class: className,
      function: functionName,
      input: SensitiveDataMasker.maskData(input),
      output: SensitiveDataMasker.maskData(output),
      duration_ms:
        durationMs !== undefined && Number.isFinite(durationMs)
          ? Number(durationMs.toFixed(3))
          : null,
    };

    if (SpanLogger.customSink) {
      SpanLogger.customSink(payload);
    } else {
      SpanLogger.logger.log(payload);
    }

    return payload;
  }
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Zero-boilerplate method decorator `@LogSpan()` (§11.1 of SYSTEM_DESIGN.md).
 *
 * Wraps both synchronous and `async` (`Promise`) methods, automatically measuring `duration_ms`,
 * masking `input` and `output` via `SensitiveDataMasker`, and emitting a `SPAN` log with the active
 * `correlation_id` from `AsyncLocalStorage`.
 */
export function LogSpan(customFunctionName?: string): MethodDecorator {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as unknown;
    if (typeof originalMethod !== 'function') {
      return descriptor;
    }

    const className =
      typeof target === 'function'
        ? target.name
        : target?.constructor?.name ?? 'UnknownClass';
    const functionName = customFunctionName ?? String(propertyKey);

    descriptor.value = function (...args: unknown[]): unknown {
      const startTimeMs = performance.now();
      const inputPayload = args.length === 1 ? args[0] : args;

      try {
        const result = (originalMethod as (...fnArgs: unknown[]) => unknown).apply(
          this,
          args,
        );

        if (isPromiseLike(result)) {
          return result.then(
            (resolvedValue: unknown) => {
              const durationMs = performance.now() - startTimeMs;
              SpanLogger.log(
                className,
                functionName,
                inputPayload,
                resolvedValue,
                durationMs,
              );
              return resolvedValue;
            },
            (rejectedError: unknown) => {
              const durationMs = performance.now() - startTimeMs;
              SpanLogger.log(
                className,
                functionName,
                inputPayload,
                {
                  error:
                    rejectedError instanceof Error
                      ? rejectedError.name
                      : 'UnhandledRejection',
                  message:
                    rejectedError instanceof Error
                      ? rejectedError.message
                      : String(rejectedError),
                },
                durationMs,
              );
              throw rejectedError;
            },
          );
        }

        const durationMs = performance.now() - startTimeMs;
        SpanLogger.log(className, functionName, inputPayload, result, durationMs);
        return result;
      } catch (syncError: unknown) {
        const durationMs = performance.now() - startTimeMs;
        SpanLogger.log(
          className,
          functionName,
          inputPayload,
          {
            error: syncError instanceof Error ? syncError.name : 'Error',
            message:
              syncError instanceof Error ? syncError.message : String(syncError),
          },
          durationMs,
        );
        throw syncError;
      }
    };

    return descriptor;
  };
}
