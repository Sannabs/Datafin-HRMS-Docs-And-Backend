import prisma from "../config/prisma.config.js";

/** @typedef {{ userId: string, name: string | null, employeeCode: string | null, reason: string }} PayrollEligibilitySkipped */

export const REASON_HIRED_AFTER_PERIOD = "Hired after this pay period ends.";
export const REASON_NO_SALARY_IN_PERIOD = "No salary in effect for this pay period.";

/**
 * @param {Date | string | null | undefined} hireDate
 * @param {Date | string} periodEndDate
 */
export function isUserHiredAfterPeriodEnd(hireDate, periodEndDate) {
    if (hireDate == null) return false;
    return new Date(hireDate) > new Date(periodEndDate);
}

/**
 * Active employees in scope → who can be queued for this pay period (hire date + overlapping salary).
 * Does not check overtime (handled at preview / process time).
 *
 * @param {string} tenantId
 * @param {{ startDate: Date, endDate: Date }} payPeriod
 * @param {string[]} candidateIds - Distinct User ids (e.g. active employees in scope)
 * @returns {Promise<{ eligibleIds: string[], skipped: PayrollEligibilitySkipped[] }>}
 */
export async function resolvePayrollPeriodEligibility(tenantId, payPeriod, candidateIds) {
    const uniqueCandidates = [...new Set(candidateIds || [])];
    if (uniqueCandidates.length === 0) {
        return { eligibleIds: [], skipped: [] };
    }

    const users = await prisma.user.findMany({
        where: { id: { in: uniqueCandidates }, tenantId },
        select: { id: true, name: true, employeeId: true, hireDate: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    /** @type {PayrollEligibilitySkipped[]} */
    const skipped = [];
    /** @type {string[]} */
    const maybeEligible = [];

    for (const id of uniqueCandidates) {
        const u = userMap.get(id);
        if (!u) {
            skipped.push({
                userId: id,
                name: null,
                employeeCode: null,
                reason: "Employee not found in this organization.",
            });
            continue;
        }
        if (isUserHiredAfterPeriodEnd(u.hireDate, payPeriod.endDate)) {
            skipped.push({
                userId: id,
                name: u.name,
                employeeCode: u.employeeId,
                reason: REASON_HIRED_AFTER_PERIOD,
            });
            continue;
        }
        maybeEligible.push(id);
    }

    if (maybeEligible.length === 0) {
        return { eligibleIds: [], skipped };
    }

    const withSalary = await prisma.salaryStructure.findMany({
        where: {
            tenantId,
            userId: { in: maybeEligible },
            effectiveDate: { lte: payPeriod.endDate },
            OR: [{ endDate: null }, { endDate: { gte: payPeriod.startDate } }],
        },
        select: { userId: true },
    });
    const salarySet = new Set(withSalary.map((s) => s.userId));

    /** @type {string[]} */
    const eligibleIds = [];
    for (const id of maybeEligible) {
        if (salarySet.has(id)) {
            eligibleIds.push(id);
        } else {
            const u = userMap.get(id);
            skipped.push({
                userId: id,
                name: u?.name ?? null,
                employeeCode: u?.employeeId ?? null,
                reason: REASON_NO_SALARY_IN_PERIOD,
            });
        }
    }

    return { eligibleIds, skipped };
}
