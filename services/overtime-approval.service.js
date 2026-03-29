import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { sumOvertimeHoursForPayPeriod } from "../utils/overtime-payroll.util.js";

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

    const grouped = await prisma.attendance.groupBy({
        by: ["userId"],
        where: {
            tenantId,
            clockInTime: {
                gte: period.startDate,
                lte: period.endDate,
            },
            clockOutTime: { not: null },
        },
        _sum: {
            overtimeHours: true,
        },
    });

    const withOt = grouped.filter((g) => Number(g._sum.overtimeHours ?? 0) > 0.0001);
    if (withOt.length === 0) {
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

    const userIds = withOt.map((g) => g.userId);
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
    for (const g of withOt) {
        const u = userById.get(g.userId);
        if (!u) continue;
        const precise = await sumOvertimeHoursForPayPeriod(g.userId, tenantId, period.startDate, period.endDate);
        const hours = Math.round(precise * 100) / 100;
        const appr = approvalByUser.get(g.userId);
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
