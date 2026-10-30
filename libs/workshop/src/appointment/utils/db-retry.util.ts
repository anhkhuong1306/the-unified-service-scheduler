import {
  ServiceUnavailableDomainException,
  SlotUnavailableException,
} from '@app/common';

export interface PostgresDriverError {
  code?: string;
  constraint?: string;
  message?: string;
}

export function mapDbError(error: unknown): never {
  const driverError = (error as { driverError?: PostgresDriverError })?.driverError;
  const code = driverError?.code;

  switch (code) {
    case '23P01': { // Exclusion violation (GiST)
      const reason =
        driverError?.constraint === 'no_technician_overlap'
          ? 'NO_QUALIFIED_TECHNICIAN'
          : driverError?.constraint === 'no_bay_overlap'
            ? 'NO_FREE_BAY'
            : 'SLOT_UNAVAILABLE';
      throw SlotUnavailableException.withAlternatives(
        reason,
        [],
        'Selected time slot was just taken by another booking. Please choose another slot.',
      );
    }
    case '55P03': // lock_timeout
    case '57014': // query_canceled / statement_timeout
    case '40P01': // deadlock_detected
      throw new ServiceUnavailableDomainException(
        'The booking service is currently experiencing high demand. Please retry shortly.',
      );
    default:
      throw error;
  }
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  maxAttempts: number = 3,
): Promise<T> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await operation(attempt);
    } catch (error: unknown) {
      const driverError = (error as { driverError?: PostgresDriverError })?.driverError;
      // Retry if reference_code collision occurred
      if (
        attempt < maxAttempts &&
        driverError?.code === '23505' &&
        driverError?.constraint?.includes('reference_code')
      ) {
        continue;
      }
      mapDbError(error);
    }
  }
  throw new ServiceUnavailableDomainException('Operation exceeded maximum retry attempts');
}
