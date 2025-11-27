import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import { sendPayPeriodStatusChangeEmail, sendPayrollCompletionEmail } from "./pay-period-notification.service.js";

/**
 * Automatically update pay period status based on payroll run states
 * @param {string} payPeriodId - Pay period ID
 * @param {string} tenantId - Tenant ID
 * @param {string|null} targetStatus - Target status (null = auto-detect)
 * @returns {Promise<Object|null>} Updated pay period or null if no change
 */
export const updatePayPeriodStatusAutomatically = async (payPeriodId, tenantId, targetStatus = null) => {
    try {
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
                tenantId,
            },
            include: {
                payrollRuns: {
                    select: {
                        id: true,
                        status: true,
                    },
                },
            },
        });

        if (!payPeriod) {
            logger.warn(`Pay period ${payPeriodId} not found for automation`);
            return null;
        }

        // If target status is provided, use it (e.g., when run starts, force PROCESSING)
        if (targetStatus) {
            if (payPeriod.status !== targetStatus) {
                const updated = await prisma.payPeriod.update({
                    where: { id: payPeriodId },
                    data: { status: targetStatus },
                });

                logger.info(`Automatically updated pay period ${payPeriodId} to ${targetStatus}`);
                await addLog(
                    "SYSTEM",
                    tenantId,
                    "UPDATE",
                    "PayPeriod",
                    payPeriodId,
                    {
                        status: { before: payPeriod.status, after: targetStatus },
                        reason: "Automatic status update triggered by payroll run",
                    },
                    null
                );

                // Send notification
                try {
                    await sendPayPeriodStatusChangeEmail(payPeriod, targetStatus, tenantId);
                } catch (emailError) {
                    logger.warn(`Failed to send status change email: ${emailError.message}`);
                }

                return updated;
            }
            return null;
        }

        // Auto-detect status based on payroll run states
        const runs = payPeriod.payrollRuns;

        if (runs.length === 0) {
            // No runs yet, keep current status (likely DRAFT)
            return null;
        }

        const hasProcessingRuns = runs.some((r) => r.status === "PROCESSING" || r.status === "DRAFT");
        const hasFailedRuns = runs.some((r) => r.status === "FAILED");
        const allRunsCompleted = runs.length > 0 && runs.every((r) => r.status === "COMPLETED");

        let newStatus = null;

        // Determine new status based on run states
        if (hasProcessingRuns && payPeriod.status !== "PROCESSING") {
            newStatus = "PROCESSING";
        } else if (allRunsCompleted && payPeriod.status !== "COMPLETED") {
            newStatus = "COMPLETED";
        } else if (hasFailedRuns && payPeriod.status === "COMPLETED") {
            // If there are failed runs, don't auto-complete (keep in PROCESSING)
            newStatus = "PROCESSING";
        }

        if (newStatus && newStatus !== payPeriod.status) {
            const updated = await prisma.payPeriod.update({
                where: { id: payPeriodId },
                data: { status: newStatus },
            });

            logger.info(`Automatically updated pay period ${payPeriodId} from ${payPeriod.status} to ${newStatus}`);
            await addLog(
                "SYSTEM",
                tenantId,
                "UPDATE",
                "PayPeriod",
                payPeriodId,
                {
                    status: { before: payPeriod.status, after: newStatus },
                    reason: `Automatic status update: ${allRunsCompleted ? "All payroll runs completed" : "Payroll runs in progress"}`,
                },
                null
            );

            // Send notifications
            try {
                if (newStatus === "COMPLETED") {
                    await sendPayrollCompletionEmail(updated, tenantId);
                } else {
                    await sendPayPeriodStatusChangeEmail(updated, newStatus, tenantId);
                }
            } catch (emailError) {
                logger.warn(`Failed to send notification email: ${emailError.message}`);
            }

            return updated;
        }

        return null;
    } catch (error) {
        logger.error(`Error in automatic pay period status update: ${error.message}`, {
            error: error.stack,
            payPeriodId,
            tenantId,
        });
        return null;
    }
};

/**
 * Check if pay period should auto-close
 * @param {string} payPeriodId - Pay period ID
 * @param {string} tenantId - Tenant ID
 * @param {number} gracePeriodHours - Grace period in hours (default 48)
 * @returns {Promise<boolean>} True if should auto-close
 */
export const shouldAutoClose = async (payPeriodId, tenantId, gracePeriodHours = 48) => {
    try {
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
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
            return false;
        }

        // Must be in COMPLETED status
        if (payPeriod.status !== "COMPLETED") {
            return false;
        }

        // All runs must be completed
        const allRunsCompleted = payPeriod.payrollRuns.length > 0 &&
            payPeriod.payrollRuns.every((r) => r.status === "COMPLETED");

        if (!allRunsCompleted) {
            return false;
        }

        // Check if grace period has passed
        const updatedAt = new Date(payPeriod.updatedAt);
        const now = new Date();
        const hoursSinceCompletion = (now - updatedAt) / (1000 * 60 * 60);

        return hoursSinceCompletion >= gracePeriodHours;
    } catch (error) {
        logger.error(`Error checking auto-close eligibility: ${error.message}`, {
            error: error.stack,
            payPeriodId,
            tenantId,
        });
        return false;
    }
};

/**
 * Auto-close pay period if conditions are met
 * @param {string} payPeriodId - Pay period ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object|null>} Updated pay period or null
 */
export const autoClosePayPeriod = async (payPeriodId, tenantId) => {
    try {
        const canAutoClose = await shouldAutoClose(payPeriodId, tenantId);

        if (!canAutoClose) {
            return null;
        }

        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
                tenantId,
            },
        });

        if (!payPeriod || payPeriod.status === "CLOSED") {
            return null;
        }

        const updated = await prisma.payPeriod.update({
            where: { id: payPeriodId },
            data: { status: "CLOSED" },
        });

        logger.info(`Automatically closed pay period ${payPeriodId}`);
        await addLog(
            "SYSTEM",
            tenantId,
            "UPDATE",
            "PayPeriod",
            payPeriodId,
            {
                status: { before: payPeriod.status, after: "CLOSED" },
                reason: "Automatic closure after grace period",
            },
            null
        );

        // Send notification
        try {
            await sendPayPeriodStatusChangeEmail(updated, "CLOSED", tenantId);
        } catch (emailError) {
            logger.warn(`Failed to send auto-close email: ${emailError.message}`);
        }

        return updated;
    } catch (error) {
        logger.error(`Error auto-closing pay period: ${error.message}`, {
            error: error.stack,
            payPeriodId,
            tenantId,
        });
        return null;
    }
};

