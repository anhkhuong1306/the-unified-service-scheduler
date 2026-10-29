export const MASKED_PLACEHOLDER = '***MASKED***';
export const MAX_MASK_RECURSION_DEPTH = 16;
export const MIN_PHONE_MASK_LENGTH = 6;
export const VISIBLE_PHONE_SUFFIX_LENGTH = 3;
export const MIN_VIN_MASK_LENGTH = 4;
export const VISIBLE_VIN_SUFFIX_LENGTH = 4;

const FULL_MASK_KEYS = new Set<string>([
  'password',
  'password_confirmation',
  'current_password',
  'new_password',
  'client_secret',
  'access_token',
  'refresh_token',
  'id_token',
  'authorization',
  'x_authorization',
  'php_auth_pw',
  'secret',
  'token',
  'api_key',
  'private_key',
]);

const EMAIL_KEYS = new Set<string>(['email', 'customer_email', 'user_email']);

const PHONE_KEYS = new Set<string>([
  'phone',
  'phone_number',
  'customer_phone',
  'mobile',
  'telephone',
]);

const VIN_KEYS = new Set<string>(['vin', 'vehicle_vin']);

const CUSTOMER_NAME_KEYS = new Set<string>(['customer_name']);

/**
 * Recursive sensitive-data & PII masker for request, response, and span logs (§11.1 of SYSTEM_DESIGN.md).
 */
export class SensitiveDataMasker {
  /**
   * Recursively mask sensitive keys and values across objects, arrays, and JSON strings.
   * Uses a `WeakSet` and depth guard to prevent infinite recursion on circular references (Rule CI40).
   */
  public static maskData<T = unknown>(
    data: T,
    fieldName?: string,
    seen: WeakSet<object> = new WeakSet<object>(),
    depth = 0,
  ): T {
    if (depth > MAX_MASK_RECURSION_DEPTH) {
      return '[MaxDepthExceeded]' as unknown as T;
    }

    if (fieldName !== undefined) {
      const normalizedKey = SensitiveDataMasker.normalizeKey(fieldName);

      if (FULL_MASK_KEYS.has(normalizedKey)) {
        return (data === null || data === undefined ? data : MASKED_PLACEHOLDER) as unknown as T;
      }

      if (typeof data === 'string') {
        if (EMAIL_KEYS.has(normalizedKey)) {
          return SensitiveDataMasker.maskEmail(data) as unknown as T;
        }
        if (PHONE_KEYS.has(normalizedKey)) {
          return SensitiveDataMasker.maskPhone(data) as unknown as T;
        }
        if (VIN_KEYS.has(normalizedKey)) {
          return SensitiveDataMasker.maskVin(data) as unknown as T;
        }
        if (CUSTOMER_NAME_KEYS.has(normalizedKey)) {
          return SensitiveDataMasker.maskCustomerName(data) as unknown as T;
        }
      }
    }

    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return SensitiveDataMasker.maskStringValue(data, seen, depth) as unknown as T;
    }

    if (typeof data !== 'object') {
      return data;
    }

    if (
      data instanceof Date ||
      data instanceof RegExp ||
      Buffer.isBuffer(data) ||
      data instanceof Error
    ) {
      return data;
    }

    const objRef = data as unknown as object;
    if (seen.has(objRef)) {
      return '[Circular]' as unknown as T;
    }
    seen.add(objRef);

    if (Array.isArray(data)) {
      return data.map((item) =>
        SensitiveDataMasker.maskData(item, undefined, seen, depth + 1),
      ) as unknown as T;
    }

    const maskedObject: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      maskedObject[key] = SensitiveDataMasker.maskData(value, key, seen, depth + 1);
    }

    return maskedObject as unknown as T;
  }

  /**
   * Mask an email keeping the first character and the domain (e.g. `j***@example.com`).
   */
  public static maskEmail(email: string): string {
    const trimmed = email.trim();
    if (trimmed === '') {
      return '';
    }

    const atIndex = trimmed.indexOf('@');
    if (atIndex <= 0 || atIndex === trimmed.length - 1) {
      return MASKED_PLACEHOLDER;
    }

    const local = trimmed.slice(0, atIndex);
    const domain = trimmed.slice(atIndex + 1);

    return `${local.charAt(0)}***@${domain}`;
  }

  /**
   * Mask a phone number keeping only the last 3 characters (e.g. `******789`).
   */
  public static maskPhone(phone: string): string {
    const trimmed = phone.trim();
    if (trimmed === '') {
      return '';
    }

    if (trimmed.length <= VISIBLE_PHONE_SUFFIX_LENGTH) {
      return MASKED_PLACEHOLDER;
    }

    const suffix = trimmed.slice(-VISIBLE_PHONE_SUFFIX_LENGTH);
    const maskLength = Math.max(
      MIN_PHONE_MASK_LENGTH,
      trimmed.length - VISIBLE_PHONE_SUFFIX_LENGTH,
    );

    return `${'*'.repeat(maskLength)}${suffix}`;
  }

  /**
   * Mask a VIN keeping only the last 4 characters (e.g. `*************4352` for a 17-char VIN).
   */
  public static maskVin(vin: string): string {
    const trimmed = vin.trim();
    if (trimmed === '') {
      return '';
    }

    if (trimmed.length <= VISIBLE_VIN_SUFFIX_LENGTH) {
      return MASKED_PLACEHOLDER;
    }

    const suffix = trimmed.slice(-VISIBLE_VIN_SUFFIX_LENGTH);
    const maskLength = Math.max(
      MIN_VIN_MASK_LENGTH,
      trimmed.length - VISIBLE_VIN_SUFFIX_LENGTH,
    );

    return `${'*'.repeat(maskLength)}${suffix}`;
  }

  /**
   * Mask a customer full name keeping the first character of each word (e.g. `J*** D***`).
   */
  public static maskCustomerName(name: string): string {
    const trimmed = name.trim();
    if (trimmed === '') {
      return MASKED_PLACEHOLDER;
    }

    const words = trimmed.split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      return MASKED_PLACEHOLDER;
    }

    return words.map((word) => `${word.charAt(0)}***`).join(' ');
  }

  /**
   * Normalize camelCase / kebab-case keys to lowercase snake_case.
   */
  public static normalizeKey(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[-\s]+/g, '_')
      .toLowerCase()
      .replace(/^_+|_+$/g, '');
  }

  private static maskStringValue(
    value: string,
    seen: WeakSet<object>,
    depth: number,
  ): string {
    const trimmed = value.trim();

    if (/^Bearer\s+\S+/i.test(trimmed)) {
      return MASKED_PLACEHOLDER;
    }

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          const maskedParsed = SensitiveDataMasker.maskData(
            parsed,
            undefined,
            seen,
            depth + 1,
          );
          return JSON.stringify(maskedParsed);
        }
      } catch {
        return value;
      }
    }

    return value;
  }
}
