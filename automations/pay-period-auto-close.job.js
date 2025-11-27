import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { autoClosePayPeriod, shouldAutoClose } from "../services/pay-period-automation.service.js";
import { sendAutoCloseWarningEmail } from "../services/pay-period-notification.service.js";

/**
 * Automation job to check and auto-close pay periods after grace period
 * Runs every hour to check for pay periods that should be auto-closed
 */
export const startPayPeriodAutoCloseJob = async () => {
    let cron;
    try {
        const cronModule = await import("node-cron");
        cron = cronModule.default;
    } catch (error) {
        logger.warn("node-cron not installed. Auto-close job will not run. Install with: npm install node-cron");
        return;
    }

    // Run every hour at minute 0
    cron.schedule("0 * * * *", async () => {
        try {
            logger.info("Starting pay period auto-close job");

            // Get all pay periods in COMPLETED status
            const completedPeriods = await prisma.payPeriod.findMany({
                where: {
                    status: "COMPLETED",
                },
                include: {
                    payrollRuns: {
                        select: {
                            status: true,
                        },
                    },
                },
            });

            logger.info(`Found ${completedPeriods.length} completed pay periods to check`);

            for (const payPeriod of completedPeriods) {
                try {
                    // Check if should auto-close (48 hour grace period by default)
                    const gracePeriodHours = 48;
                    const canAutoClose = await shouldAutoClose(
                        payPeriod.id,
                        payPeriod.tenantId,
                        gracePeriodHours
                    );

                    if (canAutoClose) {
                        // Auto-close the pay period
                        const updated = await autoClosePayPeriod(
                            payPeriod.id,
                            payPeriod.tenantId
                        );

                        if (updated) {
                            logger.info(`Auto-closed pay period ${payPeriod.id} (${payPeriod.periodName})`);
                        }
                    } else {
                        // Check if we should send warning email (24 hours before auto-close)
                        const hoursSinceCompletion = (new Date() - new Date(payPeriod.updatedAt)) / (1000 * 60 * 60);
                        const hoursUntilAutoClose = gracePeriodHours - hoursSinceCompletion;

                        // Send warning if within 24 hours of auto-close
                        if (hoursUntilAutoClose > 0 && hoursUntilAutoClose <= 24) {
                            try {
                                await sendAutoCloseWarningEmail(
                                    payPeriod,
                                    payPeriod.tenantId,
                                    Math.ceil(hoursUntilAutoClose)
                                );
                            } catch (emailError) {
                                logger.warn(`Failed to send auto-close warning: ${emailError.message}`);
                            }
                        }
                    }
                } catch (error) {
                    logger.error(`Error processing pay period ${payPeriod.id} for auto-close: ${error.message}`, {
                        error: error.stack,
                        payPeriodId: payPeriod.id,
                    });
                }
            }

            logger.info("Pay period auto-close job completed");
        } catch (error) {
            logger.error(`Error in pay period auto-close job: ${error.message}`, {
                error: error.stack,
            });
        }
    });

    logger.info("Pay period auto-close job scheduled (runs every hour)");
};

/**
 * Automation job to periodically check pay period status based on payroll run states
 * Runs every 15 minutes to update pay period statuses
 */
export const startPayPeriodStatusCheckJob = async () => {
    let cron;
    try {
        const cronModule = await import("node-cron");
        cron = cronModule.default;
    } catch (error) {
        logger.warn("node-cron not installed. Status check job will not run. Install with: npm install node-cron");
        return;
    }

    // Run every 15 minutes
    cron.schedule("*/15 * * * *", async () => {
        try {
            logger.info("Starting pay period status check job");

            // Get all pay periods that might need status updates
            const payPeriods = await prisma.payPeriod.findMany({
                where: {
                    status: {
                        in: ["DRAFT", "PROCESSING", "COMPLETED"],
                    },
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

            logger.info(`Checking ${payPeriods.length} pay periods for status updates`);

            const { updatePayPeriodStatusAutomatically } = await import("../services/pay-period-automation.service.js");

            for (const payPeriod of payPeriods) {
                try {
                    // Auto-detect and update status
                    await updatePayPeriodStatusAutomatically(
                        payPeriod.id,
                        payPeriod.tenantId,
                        null // null = auto-detect
                    );
                } catch (error) {
                    logger.error(`Error updating pay period ${payPeriod.id} status: ${error.message}`, {
                        error: error.stack,
                        payPeriodId: payPeriod.id,
                    });
                }
            }

            logger.info("Pay period status check job completed");
        } catch (error) {
            logger.error(`Error in pay period status check job: ${error.message}`, {
                error: error.stack,
            });
        }
    });

    logger.info("Pay period status check job scheduled (runs every 15 minutes)");
};

// Export function to start all automation jobs
export const startAllAutomationJobs = async () => {
    await startPayPeriodAutoCloseJob();
    await startPayPeriodStatusCheckJob();
    logger.info("All pay period automation jobs started");
};

