/**
 * Formats a Date instance as YYYY-MM-DD in the specified timezone (default 'Asia/Ho_Chi_Minh').
 */
export function getTodayDateString(now: Date, timezone: string = 'Asia/Ho_Chi_Minh'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  } catch {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
