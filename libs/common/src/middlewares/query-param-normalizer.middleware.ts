import { Injectable, NestMiddleware } from '@nestjs/common';
import { toCamelCase, transformKeysToCamelCase } from '../utils/camel-case.util';
import { toSnakeCase, transformKeysToSnakeCase } from '../utils/snake-case.util';

/**
 * Generically normalizes a key-value dictionary so all keys exist in both
 * camelCase and snake_case without hardcoding any specific domain entity.
 */
function normalizeDictionary(target: Record<string, unknown>): void {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    return;
  }

  const keys = Object.keys(target);
  for (const key of keys) {
    const value = target[key];
    const camelKey = toCamelCase(key);

    if (camelKey !== key) {
      if (target[camelKey] === undefined) {
        target[camelKey] = value;
      }
      try {
        delete target[key];
        Object.defineProperty(target, key, {
          value,
          enumerable: false,
          configurable: true,
          writable: true,
        });
      } catch {
        // Fallback for non-configurable objects
      }
    }

    // Recursively normalize nested plain objects
    const resolvedValue = target[camelKey] ?? value;
    if (resolvedValue && typeof resolvedValue === 'object' && !Array.isArray(resolvedValue) && !(resolvedValue instanceof Date)) {
      normalizeDictionary(resolvedValue as Record<string, unknown>);
    }
  }

  // Generic pagination parameter alias: per_page / perPage <-> limit
  if (target['per_page'] !== undefined && target['limit'] === undefined) {
    target['limit'] = target['per_page'];
  }
  if (target['perPage'] !== undefined && target['limit'] === undefined) {
    target['limit'] = target['perPage'];
  }
  if (target['limit'] !== undefined && target['per_page'] === undefined) {
    try {
      Object.defineProperty(target, 'per_page', {
        value: target['limit'],
        enumerable: false,
        configurable: true,
        writable: true,
      });
    } catch {}
  }
  if (target['limit'] !== undefined && target['perPage'] === undefined) {
    try {
      Object.defineProperty(target, 'perPage', {
        value: target['limit'],
        enumerable: false,
        configurable: true,
        writable: true,
      });
    } catch {}
  }
}

/**
 * Universal Normalizer Middleware.
 * Generically normalizes query parameters, route parameters, and request body
 * to provide bidirectional access (both camelCase and snake_case) across all APIs.
 * Eliminates domain-specific hardcoding and ensures seamless DTO validation.
 */
@Injectable()
export class QueryParamNormalizerMiddleware implements NestMiddleware {
  public use(
    req: {
      query?: Record<string, unknown>;
      params?: Record<string, unknown>;
      body?: Record<string, unknown>;
    },
    res: unknown,
    next: () => void,
  ): void {
    if (req.query && typeof req.query === 'object') {
      normalizeDictionary(req.query);
    }

    if (req.params && typeof req.params === 'object') {
      normalizeDictionary(req.params);
    }

    if (req.body && typeof req.body === 'object') {
      normalizeDictionary(req.body);
    }

    next();
  }
}
