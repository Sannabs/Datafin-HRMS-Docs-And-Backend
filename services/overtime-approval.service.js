import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { sumOvertimeHoursForPayPeriod } from "../utils/overtime-payroll.util.js";

const assertTenantOvertimeEnabled = async (tenantId) => {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { overtimeEnabled: true },
    });
    return tenant?.overtimeEnabled !== false;
};

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
    if (!(await assertTenantOvertimeEnabled(tenantId))) {
        return false;
    }
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
    if (!(await assertTenantOvertimeEnabled(tenantId))) {
        throw new Error("Overtime is disabled for this company");
    }
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
                position: {
                    select: {
                        title: true,
                    },
                },
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
            positionTitle: u.position?.title ?? null,
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
    if (!(await assertTenantOvertimeEnabled(tenantId))) {
        throw new Error("Overtime is disabled for this company");
    }
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

/**
 * Bulk approve/reject overtime rows for a pay period.
 * Returns per-user success/failure summary instead of failing all on first error.
 * @param {string} tenantId
 * @param {string} payPeriodId
 * @param {string[]} userIds
 * @param {"APPROVED"|"REJECTED"} status
 * @param {string} actorUserId
 * @param {string|null} notes
 */
export const setBulkOvertimeApprovalStatus = async (
    tenantId,
    payPeriodId,
    userIds,
    status,
    actorUserId,
    notes = null
) => {
    if (!(await assertTenantOvertimeEnabled(tenantId))) {
        throw new Error("Overtime is disabled for this company");
    }
    if (!["APPROVED", "REJECTED"].includes(status)) {
        throw new Error("status must be APPROVED or REJECTED");
    }

    const uniqueUserIds = Array.from(new Set((userIds || []).map((id) => String(id).trim()).filter(Boolean)));
    if (uniqueUserIds.length === 0) {
        throw new Error("userIds must contain at least one user id");
    }

    const period = await prisma.payPeriod.findFirst({ where: { id: payPeriodId, tenantId } });
    if (!period) throw new Error("Pay period not found");
    if (period.status === "CLOSED") {
        throw new Error("Pay period is closed; overtime approvals cannot be changed");
    }

    const results = await Promise.allSettled(
        uniqueUserIds.map((userId) =>
            setOvertimeApprovalStatus(tenantId, payPeriodId, userId, status, actorUserId, notes)
        )
    );

    const updatedUserIds = [];
    const failed = [];
    for (let i = 0; i < results.length; i += 1) {
        const userId = uniqueUserIds[i];
        const r = results[i];
        if (r.status === "fulfilled") {
            updatedUserIds.push(userId);
        } else {
            failed.push({ userId, message: r.reason?.message || "Failed to update overtime approval" });
        }
    }

    logger.info(`Bulk overtime ${status} completed`, {
        tenantId,
        payPeriodId,
        actorUserId,
        requested: uniqueUserIds.length,
        updated: updatedUserIds.length,
        failed: failed.length,
    });

    return {
        requestedCount: uniqueUserIds.length,
        updatedCount: updatedUserIds.length,
        failedCount: failed.length,
        updatedUserIds,
        failed,
    };
};
