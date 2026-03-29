import prisma from "../config/prisma.config.js";
import { calculateWorkingDays } from "./working-days.utils.js";

export class OvertimeNotApprovedError extends Error {
    constructor(message) {
        super(message);
        this.name = "OvertimeNotApprovedError";
        this.code = "OVERTIME_NOT_APPROVED";
    }
}

/**
 * Calendar days inclusive between period start and end (date-only semantics).
 * @param {Date|string} startDate
 * @param {Date|string} endDate
 * @returns {number}
 */
export const inclusiveCalendarDaysInPeriod = (startDate, endDate) => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
    return Math.max(1, diff + 1);
};

/**
 * Sum overtime hours from closed attendance (clock-out present) in [startDate, endDate] by clock-in time.
 * @param {string} userId
 * @param {string} tenantId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<number>}
 */
export const sumOvertimeHoursForPayPeriod = async (userId, tenantId, startDate, endDate) => {
    const rows = await prisma.attendance.findMany({
        where: {
            userId,
            tenantId,
            clockInTime: {
                gte: startDate,
                lte: endDate,
            },
            clockOutTime: { not: null },
        },
        select: { overtimeHours: true },
    });
    const sum = rows.reduce((acc, r) => acc + Number(r.overtimeHours ?? 0), 0);
    return Math.round(sum * 100) / 100;
};

/**
 * @returns {Promise<{ rawHours: number, payableHours: number, blocked: boolean, approval: object|null }>}
 */
export const getOvertimePayrollState = async (userId, tenantId, payPeriodId, periodStart, periodEnd) => {
    const rawHours = await sumOvertimeHoursForPayPeriod(userId, tenantId, periodStart, periodEnd);
    if (rawHours <= 0) {
        return { rawHours: 0, payableHours: 0, blocked: false, approval: null };
    }

    const approval = await prisma.overtimePeriodApproval.findUnique({
        where: {
            tenantId_userId_payPeriodId: {
                tenantId,
                userId,
                payPeriodId,
            },
        },
    });

    if (approval?.status === "APPROVED") {
        return { rawHours, payableHours: rawHours, blocked: false, approval };
    }

    return { rawHours, payableHours: 0, blocked: true, approval };
};

/**
 * Throws OvertimeNotApprovedError when employee has OT hours but HR has not approved.
 */
export const assertOvertimeApprovedForPayrollOrThrow = async (
    userId,
    tenantId,
    payPeriodId,
    periodStart,
    periodEnd
) => {
    const state = await getOvertimePayrollState(userId, tenantId, payPeriodId, periodStart, periodEnd);
    if (state.blocked) {
        throw new OvertimeNotApprovedError(
            `Employee has ${state.rawHours.toFixed(2)} overtime hour(s) in this pay period. ` +
                "An HR Admin must approve overtime (Payroll → Overtime) before this employee can be included in payroll."
        );
    }
    return state;
};

/**
 * Overtime pay: (monthly base / working days in period / 8) × hours × tenant multiplier
 * @param {number} baseSalaryMonthly
 * @param {string} tenantId
 * @param {Date} periodStart
 * @param {Date} periodEnd
 * @param {number} hours
 * @param {number} multiplier
 */
export const computeOvertimePayAmount = async (
    baseSalaryMonthly,
    tenantId,
    periodStart,
    periodEnd,
    hours,
    multiplier
) => {
    let workingDays = await calculateWorkingDays(new Date(periodStart), new Date(periodEnd), tenantId);
    if (!workingDays || workingDays < 1) workingDays = 1;

    const hourlyRate = baseSalaryMonthly / workingDays / 8;
    const amount = Math.round(hourlyRate * hours * multiplier * 100) / 100;
    const description = `${hours}h × ${hourlyRate.toFixed(4)}/h × ${multiplier}`;

    return {
        amount,
        hourlyRate: Math.round(hourlyRate * 10000) / 10000,
        hours,
        multiplier,
        description,
    };
};
