import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { sumOvertimeHoursForPayPeriod } from "../utils/overtime-payroll.util.js";

/**
 * Same attendance slice as list / payroll: clock-in in [start,end], clock-out set, grouped OT sum > epsilon.
 * @param {string} tenantId
 * @param {Date} startDate
 * @param {Date} endDate
 * @returns {Promise<string[]>} userIds with recorded OT in period
 */
const getUserIdsWithRecordedOvertimeInPeriod = async (tenantId, startDate, endDate) => {
    const grouped = await prisma.attendance.groupBy({
        by: ["userId"],
        where: {
            tenantId,
            clockInTime: {
                gte: startDate,
                lte: endDate,
            },
            clockOutTime: { not: null },
        },
        _sum: {
            overtimeHours: true,
        },
    });
    return grouped.filter((g) => Number(g._sum.overtimeHours ?? 0) > 0.0001).map((g) => g.userId);
};

/**
 * True if any employee with recorded OT in this period lacks APPROVED/REJECTED (matches payroll gate).
 * @param {string} tenantId
 * @param {{ id: string, startDate: Date, endDate: Date }} period
 */
export const hasUnresolvedOvertimeApprovals = async (tenantId, period) => {
    const userIds = await getUserIdsWithRecordedOvertimeInPeriod(
        tenantId,
        period.startDate,
        period.endDate
    );
    if (userIds.length === 0) {
        return false;
    }

    const approvals = await prisma.overtimePeriodApproval.findMany({
        where: {
            tenantId,
            payPeriodId: period.id,
            userId: { in: userIds },
        },
        select: { userId: true, status: true },
    });
    const byUser = new Map(approvals.map((a) => [a.userId, a.status]));

    for (const uid of userIds) {
        const st = byUser.get(uid);
        if (!st || st === "PENDING") {
            return true;
        }
    }
    return false;
};

/**
 * Employees with overtime > 0 in period + current approval row (if any).
 * @param {string} tenantId
 * @param {string} payPeriodId
 */
export const listOvertimeRowsForPayPeriod = async (tenantId, payPeriodId) => {
    const period = await prisma.payPeriod.findFirst({
        where: { id: payPeriodId, tenantId },
    });
    if (!period) {
        throw new Error("Pay period not found");
    }

    const userIds = await getUserIdsWithRecordedOvertimeInPeriod(
        tenantId,
        period.startDate,
        period.endDate
    );
    if (userIds.length === 0) {
        return {
            payPeriod: {
                id: period.id,
                periodName: period.periodName,
                startDate: period.startDate,
                endDate: period.endDate,
            },
            rows: [],
        };
    }
    const [users, approvals] = await Promise.all([
        prisma.user.findMany({
            where: { id: { in: userIds }, tenantId, isDeleted: false },
            select: {
                id: true,
                name: true,
                employeeId: true,
            },
        }),
        prisma.overtimePeriodApproval.findMany({
            where: {
                tenantId,
                payPeriodId,
                userId: { in: userIds },
            },
        }),
    ]);

    const approvalByUser = new Map(approvals.map((a) => [a.userId, a]));
    const userById = new Map(users.map((u) => [u.id, u]));

    const rows = [];
    for (const uid of userIds) {
        const u = userById.get(uid);
        if (!u) continue;
        const precise = await sumOvertimeHoursForPayPeriod(uid, tenantId, period.startDate, period.endDate);
        const hours = Math.round(precise * 100) / 100;
        const appr = approvalByUser.get(uid);
        rows.push({
            userId: u.id,
            name: u.name,
            employeeCode: u.employeeId,
            overtimeHours: hours,
            status: appr?.status ?? "PENDING",
            approvalId: appr?.id ?? null,
            approvedAt: appr?.approvedAt ?? null,
        });
    }

    rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return {
        payPeriod: {
            id: period.id,
            periodName: period.periodName,
            startDate: period.startDate,
            endDate: period.endDate,
        },
        rows,
    };
};

/**
 * @param {string} tenantId
 * @param {string} payPeriodId
 * @param {string} userId
 * @param {"APPROVED"|"REJECTED"} status
 * @param {string} actorUserId
 * @param {string|null} notes
 */
export const setOvertimeApprovalStatus = async (
    tenantId,
    payPeriodId,
    userId,
    status,
    actorUserId,
    notes = null
) => {
    if (!["APPROVED", "REJECTED"].includes(status)) {
        throw new Error("status must be APPROVED or REJECTED");
    }

    const [period, subject] = await Promise.all([
        prisma.payPeriod.findFirst({ where: { id: payPeriodId, tenantId } }),
        prisma.user.findFirst({
            where: { id: userId, tenantId, isDeleted: false },
            select: { id: true },
        }),
    ]);

    if (!period) throw new Error("Pay period not found");
    if (!subject) throw new Error("Employee not found");

    if (period.status === "CLOSED") {
        throw new Error("Pay period is closed; overtime approvals cannot be changed");
    }

    const hours = await sumOvertimeHoursForPayPeriod(userId, tenantId, period.startDate, period.endDate);
    if (hours <= 0) {
        throw new Error("No overtime hours recorded for this employee in this period");
    }

    const now = new Date();
    const row = await prisma.overtimePeriodApproval.upsert({
        where: {
            tenantId_userId_payPeriodId: {
                tenantId,
                userId,
                payPeriodId,
            },
        },
        create: {
            tenantId,
            userId,
            payPeriodId,
            status,
            approvedById: actorUserId,
            approvedAt: now,
            notes: notes || null,
        },
        update: {
            status,
            approvedById: actorUserId,
            approvedAt: now,
            ...(notes !== undefined ? { notes: notes || null } : {}),
        },
    });

    logger.info(`Overtime ${status} for user ${userId} period ${payPeriodId}`, {
        tenantId,
        actorUserId,
    });

    return row;
};
