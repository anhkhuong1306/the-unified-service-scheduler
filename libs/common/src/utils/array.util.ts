/**
 * Parses string or array input into a clean string array.
 * Supports comma-separated strings (e.g. '1,2,3' or ['1,2', '3']).
 */
export function parseIds(input?: string[] | string): string[] | undefined {
  if (!input) return undefined;
  if (Array.isArray(input)) {
    const flattened = input.flatMap((i) => i.split(',')).map((i) => i.trim()).filter(Boolean);
    return flattened.length > 0 ? flattened : undefined;
  }
  if (typeof input === 'string') {
    const split = input.split(',').map((i) => i.trim()).filter(Boolean);
    return split.length > 0 ? split : undefined;
  }
  return undefined;
}
