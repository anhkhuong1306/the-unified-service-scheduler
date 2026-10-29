/**
 * Centralized Cron Expression Constants for `apps/scheduler-worker`.
 *
 * All expressions execute in UTC (`ENV TZ=UTC`).
 */
export const CRON_EXPRESSIONS = {
  EVERY_5_MINUTES: '*/5 * * * *',
} as const;
