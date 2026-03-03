import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import { getCalendarMetadata } from "../utils/pay-period.utils.js";
import { computePeriodRanges } from "../services/pay-schedule-generation.service.js";

export const getAllPaySchedules = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { isActive } = req.query;

        const where = { tenantId, deletedAt: null };
        if (isActive !== undefined) {
            where.isActive = isActive === "true";
        }

        const schedules = await prisma.paySchedule.findMany({
            where,
            orderBy: { name: "asc" },
        });
        return res.status(200).json({
            success: true,
            data: schedules,
            count: schedules.length,
        });
    } catch (error) {
        logger.error(`Error fetching pay schedules: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch pay schedules",
        });
    }
};

export const getPayScheduleById = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const schedule = await prisma.paySchedule.findFirst({
            where: { id, tenantId, deletedAt: null },
        });
        if (!schedule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay schedule not found",
            });
        }
        return res.status(200).json({
            success: true,
            data: schedule,
        });
    } catch (error) {
        logger.error(`Error fetching pay schedule: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch pay schedule",
        });
    }
};

export const createPaySchedule = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { name, frequency, config } = req.body;
        if (!name || !frequency) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "name and frequency are required",
            });
        }
        const validFrequencies = ["SEMI_MONTHLY", "BI_WEEKLY", "MONTHLY", "WEEKLY"];
        if (!validFrequencies.includes(frequency)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `frequency must be one of: ${validFrequencies.join(", ")}`,
            });
        }
        const schedule = await prisma.paySchedule.create({
            data: {
                tenantId,
                name: name.trim(),
                frequency,
                config: config ?? undefined,
            },
        });
        logger.info(`Created pay schedule ${schedule.id} for tenant ${tenantId}`);
        await addLog(userId, tenantId, "CREATE", "PaySchedule", schedule.id, null, req);
        return res.status(201).json({
            success: true,
            data: schedule,
            message: "Pay schedule created successfully",
        });
    } catch (error) {
        logger.error(`Error creating pay schedule: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create pay schedule",
        });
    }
};

export const updatePaySchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { name, frequency, config } = req.body;
        const schedule = await prisma.paySchedule.findFirst({
            where: { id, tenantId, deletedAt: null },
        });
        if (!schedule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay schedule not found",
            });
        }
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (frequency !== undefined) {
            const valid = ["SEMI_MONTHLY", "BI_WEEKLY", "MONTHLY", "WEEKLY"];
            if (!valid.includes(frequency)) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `frequency must be one of: ${valid.join(", ")}`,
                });
            }
            updates.frequency = frequency;
        }
        if (config !== undefined) updates.config = config;
        const updated = await prisma.paySchedule.update({
            where: { id },
            data: updates,
        });
        logger.info(`Updated pay schedule ${id}`);
        await addLog(userId, tenantId, "UPDATE", "PaySchedule", id, { updates }, req);
        return res.status(200).json({
            success: true,
            data: updated,
            message: "Pay schedule updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating pay schedule: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update pay schedule",
        });
    }
};

/**
 * Permanently delete a pay schedule. Only allowed when inactive.
 * Periods that referenced this schedule will have payScheduleId set to null (ON DELETE SET NULL).
 */
export const deletePaySchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const schedule = await prisma.paySchedule.findFirst({
            where: { id, tenantId, deletedAt: null },
        });
        if (!schedule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay schedule not found",
            });
        }
        if (schedule.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete an active pay schedule. Deactivate it first, then delete.",
            });
        }
        const auditPayload = {
            deleted: true,
            name: schedule.name,
        };
        await addLog(userId, tenantId, "DELETE", "PaySchedule", id, auditPayload, req);
        await prisma.paySchedule.delete({ where: { id } });
        logger.info(`Permanently deleted pay schedule ${id} by user ${userId}`);
        return res.status(200).json({
            success: true,
            message: "Pay schedule permanently deleted",
        });
    } catch (error) {
        logger.error(`Error deleting pay schedule: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete pay schedule",
        });
    }
};

/**
 * Activate a pay schedule. Dedicated endpoint for clear audit trail.
 */
export const activatePaySchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const existing = await prisma.paySchedule.findFirst({
            where: { id, tenantId, deletedAt: null },
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay schedule not found",
            });
        }
        if (existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Pay schedule is already active",
            });
        }
        const updated = await prisma.paySchedule.update({
            where: { id },
            data: { isActive: true },
        });
        await addLog(userId, tenantId, "ACTIVATE", "PaySchedule", id, { isActive: { before: false, after: true } }, req);
        logger.info(`Pay schedule ${id} activated by user ${userId}`);
        return res.status(200).json({
            success: true,
            data: updated,
            message: "Pay schedule activated successfully",
        });
    } catch (error) {
        logger.error(`Error activating pay schedule: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to activate pay schedule",
        });
    }
};

/**
 * Deactivate a pay schedule. Dedicated endpoint for clear audit trail.
 */
export const deactivatePaySchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;
        const existing = await prisma.paySchedule.findFirst({
            where: { id, tenantId, deletedAt: null },
        });
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay schedule not found",
            });
        }
        if (!existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Pay schedule is already inactive",
            });
        }
        const updated = await prisma.paySchedule.update({
            where: { id },
            data: { isActive: false },
        });
        await addLog(userId, tenantId, "DEACTIVATE", "PaySchedule", id, { isActive: { before: true, after: false } }, req);
        logger.info(`Pay schedule ${id} deactivated by user ${userId}`);
        return res.status(200).json({
            success: true,
            data: updated,
            message: "Pay schedule deactivated successfully",
        });
    } catch (error) {
        logger.error(`Error deactivating pay schedule: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to deactivate pay schedule",
        });
    }
};

/**
 * Generate pay periods from a schedule.
 * Body: { fromDate, toDate } OR { count }.
 * For "count", we use the latest period end date in the tenant as reference (or today).
 */
export const generatePeriods = async (req, res) => {
    try {
        const { id: scheduleId } = req.params;
        const { id: userId, tenantId } = req.user;
        const { fromDate, toDate, count } = req.body;

        const schedule = await prisma.paySchedule.findFirst({
            where: { id: scheduleId, tenantId, deletedAt: null, isActive: true },
        });
        if (!schedule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay schedule not found or not active",
            });
        }

        let referenceEnd = new Date();
        if (typeof count === "number" && count > 0) {
            const latest = await prisma.payPeriod.findFirst({
                where: { tenantId },
                orderBy: { endDate: "desc" },
            });
            if (latest) referenceEnd = latest.endDate;
        }

        const options = fromDate && toDate
            ? { fromDate, toDate }
            : typeof count === "number" && count > 0
                ? { count: Math.min(Math.max(1, count), 24) }
                : null;

        if (!options) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Provide either { fromDate, toDate } or { count }",
            });
        }

        const ranges = computePeriodRanges(
            { frequency: schedule.frequency, config: schedule.config },
            options,
            referenceEnd
        );

        const created = [];
        for (const range of ranges) {
            const overlap = await prisma.payPeriod.findFirst({
                where: {
                    tenantId,
                    startDate: { lte: range.endDate },
                    endDate: { gte: range.startDate },
                },
            });
            if (overlap) continue;
            const { calendarMonth, calendarYear } = getCalendarMetadata(range.startDate);
            const period = await prisma.payPeriod.create({
                data: {
                    tenantId,
                    payScheduleId: scheduleId,
                    periodName: range.periodName,
                    startDate: range.startDate,
                    endDate: range.endDate,
                    calendarMonth,
                    calendarYear,
                },
            });
            created.push(period);
        }

        logger.info(`Generated ${created.length} pay periods from schedule ${scheduleId} for tenant ${tenantId}`);
        await addLog(userId, tenantId, "CREATE", "PayPeriod", "bulk", { scheduleId, count: created.length }, req);

        return res.status(201).json({
            success: true,
            data: created,
            count: created.length,
            message: `Created ${created.length} pay period(s)`,
        });
    } catch (error) {
        logger.error(`Error generating periods: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to generate pay periods",
        });
    }
};
