/**
 * Converts a string to snake_case.
 * Handles camelCase, PascalCase, and kebab-case.
 */
export function toSnakeCase(str: string): string {
  if (!str) return str;
  return str
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase();
}

/**
 * Deeply transforms all object keys to snake_case.
 * Preserves Date objects, Buffers, primitive values, and null/undefined.
 */
export function transformKeysToSnakeCase<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) {
    return value as T;
  }

  // Preserve Date instances
  if (value instanceof Date) {
    return value as unknown as T;
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    return value.map((item) => transformKeysToSnakeCase(item)) as unknown as T;
  }

  // Handle Objects
  if (typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const snakeKey = toSnakeCase(k);
      result[snakeKey] = transformKeysToSnakeCase(v);
    }
    return result as T;
  }

  // Handle other object types (like class instances with toJSON or plain properties)
  if (typeof value === 'object') {
    const plainObj = typeof (value as { toJSON?: () => unknown }).toJSON === 'function'
      ? (value as { toJSON: () => unknown }).toJSON()
      : { ...value };
    
    if (typeof plainObj === 'object' && plainObj !== null && plainObj !== value) {
      return transformKeysToSnakeCase(plainObj);
    }
  }

  return value as T;
}
