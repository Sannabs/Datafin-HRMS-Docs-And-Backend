/**
 * Employee employment status (Prisma enum `EmployeeStatus`).
 * Keep arrays in sync with prisma/schema.prisma.
 */

/** Every persisted status value — use for API / CSV / invitation validation */
export const VALID_EMPLOYMENT_STATUSES = ["INACTIVE", "ACTIVE", "ON_LEAVE", "PROBATION"];

/**
 * Statuses treated like ACTIVE for payroll, attendance eligibility, manager checks, etc.
 */
export const EMPLOYEE_STATUSES_ACTIVE_FOR_WORK = ["ACTIVE", "PROBATION"];

/** @param {string | null | undefined} status */
export function isEmployeeActiveForWork(status) {
    return EMPLOYEE_STATUSES_ACTIVE_FOR_WORK.includes(String(status || "").toUpperCase());
}
