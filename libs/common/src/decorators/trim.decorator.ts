import { Transform, TransformFnParams } from 'class-transformer';

/**
 * Property decorator that trims whitespace from string inputs.
 * Type-safe drop-in replacement for inline `Transform(({ value }) => ...)` to eliminate implicit any errors.
 */
export function Trim(): PropertyDecorator {
  return Transform(({ value }: TransformFnParams) =>
    typeof value === 'string' ? value.trim() : value,
  );
}
