/**
 * PostgreSQL Advisory Lock Namespaces (SYSTEM_DESIGN.md §7.2, §7.5, §8)
 *
 * - `NS_BOOKING` (1001): Serializes booking, edit, reassignment, and slot swap transactions per dealership
 *   via `SELECT pg_advisory_xact_lock(NS_BOOKING, dealership_id)`.
 * - `NS_CRON_EXPIRE` (1002): Guards the single-replica `ExpirePendingAppointmentsCron` job
 *   via `SELECT pg_try_advisory_xact_lock(NS_CRON_EXPIRE, 1)`.
 * - `NS_CUSTOMER` (1003): Guards customer active-appointment limits across different dealerships
 *   via `SELECT pg_advisory_xact_lock(NS_CUSTOMER, customer_id)`.
 */
export const NS_BOOKING = 1001;
export const NS_CRON_EXPIRE = 1002;
export const NS_CUSTOMER = 1003;
