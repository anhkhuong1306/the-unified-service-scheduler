/**
 * Converts a string to camelCase.
 * Handles snake_case, kebab-case, and normalizes domain compounds (e.g. dealer_ship / dealerShip -> dealership).
 */
export function toCamelCase(str: string): string {
  if (!str) return str;
  return str
    .replace(/dealer[-_]?ship/gi, 'dealership')
    .replace(/^_+/, '')
    .replace(/[-_]+([a-zA-Z0-9])/g, (_, char) => char.toUpperCase())
    .replace(/^([A-Z])/, (char) => char.toLowerCase());
}

/**
 * Deeply transforms all object keys to camelCase.
 * Preserves Date objects, Buffers, primitive values, and null/undefined.
 */
export function transformKeysToCamelCase<T = unknown>(value: unknown): T {
  if (value === null || value === undefined) {
    return value as T;
  }

  // Preserve Date instances
  if (value instanceof Date) {
    return value as unknown as T;
  }

  // Preserve Buffer if running in Node
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return value as unknown as T;
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    return value.map((item) => transformKeysToCamelCase(item)) as unknown as T;
  }

  // Handle Plain Objects
  if (typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const camelKey = toCamelCase(k);
      result[camelKey] = transformKeysToCamelCase(v);
    }
    return result as T;
  }

  // Handle other object types (like class instances with toJSON or plain properties)
  if (typeof value === 'object') {
    const plainObj = typeof (value as { toJSON?: () => unknown }).toJSON === 'function'
      ? (value as { toJSON: () => unknown }).toJSON()
      : { ...value };

    if (typeof plainObj === 'object' && plainObj !== null && plainObj !== value) {
      return transformKeysToCamelCase(plainObj);
    }
  }

  return value as T;
}
