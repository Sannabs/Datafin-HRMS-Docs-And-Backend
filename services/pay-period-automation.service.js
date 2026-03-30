import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import { sendPayPeriodStatusChangeEmail, sendPayrollCompletionEmail } from "./pay-period-notification.service.js";
import { validateStatusTransition } from "../utils/pay-period.utils.js";
import { hasUnresolvedOvertimeApprovals } from "./overtime-approval.service.js";

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

        // Build context for state machine guards
        const runs = payPeriod.payrollRuns;
        const hasIncompleteRuns = runs.some((r) => r.status === "PROCESSING" || r.status === "DRAFT");
        const hasFailedRuns = runs.some((r) => r.status === "FAILED");
        const machineContext = { hasIncompleteRuns, hasFailedRuns };

        // If target status is provided, validate using state machine
        if (targetStatus) {
            if (payPeriod.status !== targetStatus) {
                // Validate transition using state machine
                const validation = validateStatusTransition(payPeriod.status, targetStatus, machineContext);

                if (!validation.valid) {
                    logger.warn(`Invalid status transition for pay period ${payPeriodId}: ${validation.message}`);
                    return null;
                }

                const updated = await prisma.payPeriod.update({
                    where: { id: payPeriodId },
                    data: { status: targetStatus },
                });

                logger.info(`Automatically updated pay period ${payPeriodId} to ${targetStatus} (event: ${validation.event})`);
                await addLog(
                    "SYSTEM",
                    tenantId,
                    "UPDATE",
                    "PayPeriod",
                    payPeriodId,
                    {
                        status: { before: payPeriod.status, after: targetStatus },
                        reason: "Automatic status update triggered by payroll run",
                        event: validation.event,
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
        if (runs.length === 0) {
            // No runs yet, keep current status (likely DRAFT)
            return null;
        }

        const allRunsCompleted = runs.length > 0 && runs.every((r) => r.status === "COMPLETED");

        // Determine the next logical status using state machine
        let newStatus = null;
        let reason = "";

        if (hasIncompleteRuns && payPeriod.status === "DRAFT") {
            newStatus = "PROCESSING";
            reason = "Payroll runs started";
        } else if (allRunsCompleted && !hasFailedRuns && payPeriod.status === "PROCESSING") {
            newStatus = "COMPLETED";
            reason = "All payroll runs completed successfully";
        }

        if (newStatus && newStatus !== payPeriod.status) {
            // Validate using state machine
            const validation = validateStatusTransition(payPeriod.status, newStatus, machineContext);

            if (!validation.valid) {
                logger.warn(`Cannot auto-update pay period ${payPeriodId}: ${validation.message}`);
                return null;
            }

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
                    reason: `Automatic status update: ${reason}`,
                    event: validation.event,
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

        // Check if auto-close is paused
        if (payPeriod.autoClosePaused) {
            logger.debug(`Auto-close is paused for pay period ${payPeriodId}`);
            return false;
        }

        // All runs must be completed
        const allRunsCompleted = payPeriod.payrollRuns.length > 0 &&
            payPeriod.payrollRuns.every((r) => r.status === "COMPLETED");

        if (!allRunsCompleted) {
            return false;
        }

        if (await hasUnresolvedOvertimeApprovals(tenantId, payPeriod)) {
            logger.debug(
                `Auto-close skipped for pay period ${payPeriodId}: unresolved overtime approvals`
            );
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
            include: {
                payrollRuns: {
                    select: { status: true },
                },
            },
        });

        if (!payPeriod || payPeriod.status === "CLOSED") {
            return null;
        }

        if (payPeriod.status !== "COMPLETED") {
            logger.warn(`Cannot auto-close pay period ${payPeriodId}: expected COMPLETED, got ${payPeriod.status}`);
            return null;
        }

        const hasIncompleteRuns = payPeriod.payrollRuns.some((r) =>
            r.status === "PROCESSING" || r.status === "DRAFT"
        );
        const hasFailedRuns = payPeriod.payrollRuns.some((r) => r.status === "FAILED");

        if (hasIncompleteRuns || hasFailedRuns) {
            logger.warn(
                `Cannot auto-close pay period ${payPeriodId}: incomplete or failed payroll runs still present`
            );
            return null;
        }

        if (await hasUnresolvedOvertimeApprovals(tenantId, payPeriod)) {
            logger.warn(
                `Cannot auto-close pay period ${payPeriodId}: unresolved overtime approvals`
            );
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
                event: "AUTO_CLOSE",
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

