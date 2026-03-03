import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import {
    getCalendarMetadata,
    formatPeriodNameFromDates,
    validateStatusTransition,
    getAvailableTransitions,
    getStateMeta,
    isTerminalStatus,
    formatPayPeriodResponse,
} from "../utils/pay-period.utils.js";

export const createPayPeriod = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { periodName: periodNameRaw, startDate, endDate } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "startDate and endDate are required",
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Invalid startDate or endDate provided",
            });
        }

        if (start >= end) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "startDate must be earlier than endDate",
            });
        }

        const periodName =
            periodNameRaw != null && String(periodNameRaw).trim() !== ""
                ? String(periodNameRaw).trim()
                : formatPeriodNameFromDates(start, end);

        const overlap = await prisma.payPeriod.findFirst({
            where: {
                tenantId,
                startDate: { lte: end },
                endDate: { gte: start },
            },
        });

        if (overlap) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Pay period overlaps with existing period ${overlap.periodName}`,
            });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { allowPastPayPeriodCreation: true, maxPayPeriodLookbackDays: true },
        });
        const allowPast = tenant?.allowPastPayPeriodCreation ?? true;
        const maxLookback = tenant?.maxPayPeriodLookbackDays ?? null;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const endDateOnly = new Date(end);
        endDateOnly.setHours(0, 0, 0, 0);

        if (!allowPast && endDateOnly < todayStart) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Past pay periods are not allowed for this organization",
            });
        }
        if (maxLookback != null && maxLookback >= 0) {
            const cutoff = new Date(todayStart);
            cutoff.setDate(cutoff.getDate() - maxLookback);
            if (endDateOnly < cutoff) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Pay period cannot end more than ${maxLookback} days ago`,
                });
            }
        }

        const { calendarMonth, calendarYear } = getCalendarMetadata(start);

        const payPeriod = await prisma.payPeriod.create({
            data: {
                tenantId,
                periodName,
                startDate: start,
                endDate: end,
                calendarMonth,
                calendarYear,
            },
        });

        logger.info(`Created pay period ${payPeriod.id} for tenant ${tenantId}`);
        await addLog(userId, tenantId, "CREATE", "PayPeriod", payPeriod.id, null, req);

        return res.status(201).json({
            success: true,
            data: payPeriod,
            message: "Pay period created successfully",
        });
    } catch (error) {
        logger.error(`Error creating pay period: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create pay period",
        });
    }
};

export const getPayPeriods = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { status, fromDate, toDate } = req.query;

        const where = {
            tenantId,
            ...(status && { status }),
            ...(fromDate && { startDate: { gte: new Date(fromDate) } }),
            ...(toDate && { endDate: { lte: new Date(toDate) } }),
        };

        const payPeriods = await prisma.payPeriod.findMany({
            where,
            include: {
                paySchedule: {
                    select: { id: true, name: true },
                },
                payrollRuns: {
                    select: {
                        id: true,
                        status: true,
                        totalEmployees: true,
                        totalGrossPay: true,
                        totalNetPay: true,
                    },
                },
            },
            orderBy: [
                { calendarYear: "asc" },
                { calendarMonth: "asc" },
                { startDate: "asc" },
            ],
        });

        const formatted = payPeriods.map(formatPayPeriodResponse);

        logger.info(`Retrieved ${formatted.length} pay periods for tenant ${tenantId}`);

        return res.status(200).json({
            success: true,
            data: formatted,
            count: formatted.length,
        });
    } catch (error) {
        logger.error(`Error fetching pay periods: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch pay periods",
        });
    }
};

export const getPayPeriodById = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                paySchedule: {
                    select: { id: true, name: true },
                },
                payrollRuns: {
                    select: {
                        id: true,
                        status: true,
                        totalEmployees: true,
                        totalGrossPay: true,
                        totalNetPay: true,
                        runDate: true,
                    },
                },
            },
        });

        if (!payPeriod) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay period not found",
            });
        }

        logger.info(`Retrieved pay period ${id} for tenant ${tenantId}`);

        return res.status(200).json({
            success: true,
            data: formatPayPeriodResponse(payPeriod),
        });
    } catch (error) {
        logger.error(`Error fetching pay period: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch pay period",
        });
    }
};

/**
 * Update pay period name and/or dates. Only allowed when status is DRAFT.
 * Body: { periodName?, startDate?, endDate? } (at least one required).
 */
export const updatePayPeriod = async (req, res) => {
    try {
        const { id } = req.params;
        const { periodName, startDate, endDate } = req.body;
        const { id: userId, tenantId } = req.user;

        const payPeriod = await prisma.payPeriod.findFirst({
            where: { id, tenantId },
        });

        if (!payPeriod) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay period not found",
            });
        }

        if (payPeriod.status !== "DRAFT") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Only pay periods in DRAFT status can be updated",
            });
        }

        const updates = {};
        if (periodName !== undefined) {
            if (!periodName || typeof periodName !== "string" || !periodName.trim()) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "periodName must be a non-empty string",
                });
            }
            updates.periodName = periodName.trim();
        }
        if (startDate !== undefined || endDate !== undefined) {
            const start = startDate !== undefined ? new Date(startDate) : payPeriod.startDate;
            const end = endDate !== undefined ? new Date(endDate) : payPeriod.endDate;
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Invalid startDate or endDate provided",
                });
            }
            if (start >= end) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "startDate must be earlier than endDate",
                });
            }
            const overlap = await prisma.payPeriod.findFirst({
                where: {
                    tenantId,
                    id: { not: id },
                    startDate: { lte: end },
                    endDate: { gte: start },
                },
            });
            if (overlap) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Pay period overlaps with existing period ${overlap.periodName}`,
                });
            }
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { allowPastPayPeriodCreation: true, maxPayPeriodLookbackDays: true },
            });
            const allowPast = tenant?.allowPastPayPeriodCreation ?? true;
            const maxLookback = tenant?.maxPayPeriodLookbackDays ?? null;
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const endDateOnly = new Date(end);
            endDateOnly.setHours(0, 0, 0, 0);

            if (!allowPast && endDateOnly < todayStart) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Past pay periods are not allowed for this organization",
                });
            }
            if (maxLookback != null && maxLookback >= 0) {
                const cutoff = new Date(todayStart);
                cutoff.setDate(cutoff.getDate() - maxLookback);
                if (endDateOnly < cutoff) {
                    return res.status(400).json({
                        success: false,
                        error: "Bad Request",
                        message: `Pay period cannot end more than ${maxLookback} days ago`,
                    });
                }
            }
            updates.startDate = start;
            updates.endDate = end;
            updates.periodName = formatPeriodNameFromDates(start, end);
            const { calendarMonth, calendarYear } = getCalendarMetadata(start);
            updates.calendarMonth = calendarMonth;
            updates.calendarYear = calendarYear;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "At least one of periodName, startDate, or endDate is required",
            });
        }

        const updated = await prisma.payPeriod.update({
            where: { id },
            data: updates,
        });

        logger.info(`Updated pay period ${id} for tenant ${tenantId}`);
        await addLog(userId, tenantId, "UPDATE", "PayPeriod", id, { updates }, req);

        return res.status(200).json({
            success: true,
            data: updated,
            message: "Pay period updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating pay period: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update pay period",
        });
    }
};

export const updatePayPeriodStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status: nextStatus } = req.body;
        const { id: userId, tenantId } = req.user;

        if (!nextStatus) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Status is required",
            });
        }

        const payPeriod = await prisma.payPeriod.findFirst({
            where: { id, tenantId },
            include: {
                payrollRuns: true,
            },
        });

        if (!payPeriod) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay period not found",
            });
        }

        // Check if current status is terminal
        if (isTerminalStatus(payPeriod.status)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Pay period is ${payPeriod.status} and cannot be modified`,
            });
        }

        // Build context for state machine guards
        const hasIncompleteRuns = payPeriod.payrollRuns.some(
            (run) => run.status === "PROCESSING" || run.status === "DRAFT"
        );
        const hasFailedRuns = payPeriod.payrollRuns.some((run) => run.status === "FAILED");

        // Validate transition using state machine
        const transition = validateStatusTransition(payPeriod.status, nextStatus, {
            hasIncompleteRuns,
            hasFailedRuns,
        });

        if (!transition.valid) {
            // Get available transitions for helpful error message
            const availableTransitions = getAvailableTransitions(payPeriod.status);
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: transition.message,
                availableTransitions,
                currentStatus: payPeriod.status,
            });
        }

        // Additional business rule validations
        if (nextStatus === "PROCESSING" && payPeriod.payrollRuns.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "At least one payroll run must exist to move pay period to PROCESSING",
            });
        }

        const updated = await prisma.payPeriod.update({
            where: { id },
            data: { status: nextStatus },
        });

        logger.info(`Updated pay period ${id} status to ${nextStatus} (event: ${transition.event})`);
        await addLog(
            userId,
            tenantId,
            "UPDATE",
            "PayPeriod",
            id,
            {
                status: { before: payPeriod.status, after: nextStatus },
                event: transition.event,
            },
            req
        );

        // Get metadata for the new state
        const stateMeta = getStateMeta(nextStatus);

        return res.status(200).json({
            success: true,
            data: {
                ...updated,
                stateMeta,
                availableTransitions: getAvailableTransitions(nextStatus),
            },
            message: "Pay period status updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating pay period status: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update pay period status",
        });
    }
};

export const deletePayPeriod = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const payPeriod = await prisma.payPeriod.findFirst({
            where: { id, tenantId },
            include: {
                _count: {
                    select: {
                        payrollRuns: true,
                    },
                },
            },
        });

        if (!payPeriod) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay period not found",
            });
        }

        if (payPeriod.status !== "DRAFT") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Only pay periods in DRAFT status can be deleted",
            });
        }

        if (payPeriod._count.payrollRuns > 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete pay period with existing payroll runs",
            });
        }

        await prisma.payPeriod.delete({
            where: { id },
        });

        logger.info(`Deleted pay period ${id}`);
        await addLog(userId, tenantId, "DELETE", "PayPeriod", id, null, req);

        return res.status(200).json({
            success: true,
            message: "Pay period deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting pay period: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete pay period",
        });
    }
};

export const pauseAutoClose = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                payrollRuns: {
                    select: {
                        status: true,
                    },
                },
            },
        });

        if (!payPeriod) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay period not found",
            });
        }

        if (payPeriod.status !== "COMPLETED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Auto-close can only be paused for pay periods in COMPLETED status",
            });
        }

        if (payPeriod.autoClosePaused) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Auto-close is already paused for this pay period",
            });
        }

        // Update the autoClosePaused field
        const updated = await prisma.payPeriod.update({
            where: { id },
            data: { autoClosePaused: true },
        });

        logger.info(`Auto-close paused for pay period ${id} by user ${userId}`);
        await addLog(
            userId,
            tenantId,
            "PAUSE",
            "PayPeriod",
            id,
            {
                autoClosePaused: { before: false, after: true },
                reason: "HR Admin paused auto-close",
            },
            req
        );

        return res.status(200).json({
            success: true,
            message: "Auto-close paused successfully. Pay period will not automatically close.",
            data: updated,
        });
    } catch (error) {
        logger.error(`Error pausing auto-close: ${error.message}`, {
            error: error.stack,
            payPeriodId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to pause auto-close",
        });
    }
};

export const resumeAutoClose = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id,
                tenantId,
            },
        });

        if (!payPeriod) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay period not found",
            });
        }

        if (payPeriod.status !== "COMPLETED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Auto-close can only be resumed for pay periods in COMPLETED status",
            });
        }

        if (!payPeriod.autoClosePaused) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Auto-close is not paused for this pay period",
            });
        }

        // Update the autoClosePaused field
        const updated = await prisma.payPeriod.update({
            where: { id },
            data: { autoClosePaused: false },
        });

        logger.info(`Auto-close resumed for pay period ${id} by user ${userId}`);
        await addLog(
            userId,
            tenantId,
            "RESUME",
            "PayPeriod",
            id,
            {
                autoClosePaused: { before: true, after: false },
                reason: "HR Admin resumed auto-close",
            },
            req
        );

        return res.status(200).json({
            success: true,
            message: "Auto-close resumed successfully. Pay period will automatically close after grace period.",
            data: updated,
        });
    } catch (error) {
        logger.error(`Error resuming auto-close: ${error.message}`, {
            error: error.stack,
            payPeriodId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to resume auto-close",
        });
    }
};

