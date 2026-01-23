import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { createNotification } from "../services/notification.service.js";
import { sendLeaveEndingReminderEmail } from "../views/sendLeaveEndingReminderEmail.js";

/**
 * Automation job to process leave accruals
 * Runs on 1st of each month at 1:00 AM
 * Processes monthly/quarterly accruals for employees with ACCRUAL method
 */
export const startLeaveAccrualJob = async () => {
    let cron;
    try {
        const cronModule = await import("node-cron");
        cron = cronModule.default;
    } catch (error) {
        logger.warn("node-cron not installed. Leave accrual job will not run. Install with: npm install node-cron");
        return;
    }

    cron.schedule("0 1 1 * *", async () => {
        const startTime = Date.now();
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        logger.info(`[Leave Accrual Job] Starting leave accrual processing at ${now.toISOString()}`);

        try {
            const accrualPolicies = await prisma.annualLeavePolicy.findMany({
                where: {
                    accrualMethod: "ACCRUAL",
                    accrualFrequency: {
                        not: null,
                    },
                    accrualDaysPerPeriod: {
                        not: null,
                    },
                },
                include: {
                    tenant: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            logger.info(`[Leave Accrual Job] Found ${accrualPolicies.length} tenants with ACCRUAL policies`);

            let totalProcessed = 0;
            let totalAccrued = 0;
            let totalSkipped = 0;
            let totalErrors = 0;

            for (const policy of accrualPolicies) {
                try {
                    const entitlements = await prisma.yearlyEntitlement.findMany({
                        where: {
                            tenantId: policy.tenantId,
                            year: currentYear,
                            policyId: policy.id,
                        },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    employeeId: true,
                                },
                            },
                        },
                    });

                    logger.info(
                        `[Leave Accrual Job] Processing ${entitlements.length} entitlements for tenant ${policy.tenant.name} (${policy.tenantId})`
                    );

                    for (const entitlement of entitlements) {
                        try {
                            const periodsToAccrue = calculatePeriodsToAccrue(
                                entitlement,
                                policy,
                                currentMonth,
                                now
                            );

                            if (periodsToAccrue === 0) {
                                totalSkipped++;
                                continue;
                            }

                            const daysToAccrue = periodsToAccrue * policy.accrualDaysPerPeriod;
                            const maxAccruedDays = calculateMaxAccruedDays(entitlement, policy, currentYear);
                            const currentAccruedDays = entitlement.accruedDays;
                            const newAccruedDays = Math.min(
                                currentAccruedDays + daysToAccrue,
                                maxAccruedDays
                            );
                            const actualAccrued = newAccruedDays - currentAccruedDays;

                            if (actualAccrued > 0) {
                                await prisma.yearlyEntitlement.update({
                                    where: { id: entitlement.id },
                                    data: {
                                        accruedDays: newAccruedDays,
                                        lastAccrualDate: now,
                                    },
                                });

                                totalAccrued += actualAccrued;
                                totalProcessed++;

                                logger.info(
                                    `[Leave Accrual Job] Accrued ${actualAccrued.toFixed(2)} days for ${entitlement.user.name} (${entitlement.user.employeeId}). New balance: ${newAccruedDays.toFixed(2)}/${maxAccruedDays.toFixed(2)}`
                                );
                            } else {
                                totalSkipped++;
                                logger.debug(
                                    `[Leave Accrual Job] Skipped ${entitlement.user.name} - already at max accrued days`
                                );
                            }
                        } catch (error) {
                            totalErrors++;
                            logger.error(
                                `[Leave Accrual Job] Error processing entitlement ${entitlement.id} for user ${entitlement.userId}: ${error.message}`,
                                {
                                    error: error.stack,
                                    entitlementId: entitlement.id,
                                    userId: entitlement.userId,
                                }
                            );
                        }
                    }
                } catch (error) {
                    totalErrors++;
                    logger.error(
                        `[Leave Accrual Job] Error processing tenant ${policy.tenantId}: ${error.message}`,
                        {
                            error: error.stack,
                            tenantId: policy.tenantId,
                        }
                    );
                }
            }

            const duration = Date.now() - startTime;
            logger.info(
                `[Leave Accrual Job] Completed in ${duration}ms. Processed: ${totalProcessed}, Accrued: ${totalAccrued.toFixed(2)} days, Skipped: ${totalSkipped}, Errors: ${totalErrors}`
            );
        } catch (error) {
            logger.error(`[Leave Accrual Job] Fatal error: ${error.message}`, {
                error: error.stack,
            });
        }
    });

    logger.info("[Leave Accrual Job] Scheduled to run on 1st of each month at 1:00 AM");
};

/**
 * Calculate periods to accrue based on frequency and last accrual date
 */
function calculatePeriodsToAccrue(entitlement, policy, currentMonth, now) {
    const { accrualFrequency, accrualDaysPerPeriod } = policy;

    if (!accrualFrequency || !accrualDaysPerPeriod) {
        return 0;
    }

    const effectiveStartDate = entitlement.lastAccrualDate || entitlement.yearStartDate;
    const startDate = new Date(effectiveStartDate);
    const currentDate = new Date(now);

    const monthsSinceStart =
        (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
        (currentDate.getMonth() - startDate.getMonth());

    switch (accrualFrequency) {
        case "MONTHLY": {
            if (!entitlement.lastAccrualDate) {
                return Math.max(0, monthsSinceStart);
            } else {
                const lastAccrual = new Date(entitlement.lastAccrualDate);
                const monthsSinceLastAccrual =
                    (currentDate.getFullYear() - lastAccrual.getFullYear()) * 12 +
                    (currentDate.getMonth() - lastAccrual.getMonth());
                return Math.max(0, monthsSinceLastAccrual);
            }
        }

        case "QUARTERLY": {
            if (!entitlement.lastAccrualDate) {
                const quartersSinceStart = Math.floor(monthsSinceStart / 3);
                return Math.max(0, quartersSinceStart);
            } else {
                const lastAccrual = new Date(entitlement.lastAccrualDate);
                const monthsSinceLastAccrual =
                    (currentDate.getFullYear() - lastAccrual.getFullYear()) * 12 +
                    (currentDate.getMonth() - lastAccrual.getMonth());
                const quartersSinceLastAccrual = Math.floor(monthsSinceLastAccrual / 3);
                return Math.max(0, quartersSinceLastAccrual);
            }
        }

        case "ANNUALLY": {
            if (!entitlement.lastAccrualDate) {
                const yearStart = new Date(entitlement.yearStartDate);
                return currentDate >= yearStart ? 1 : 0;
            } else {
                const lastAccrual = new Date(entitlement.lastAccrualDate);
                const yearsSinceLastAccrual =
                    currentDate.getFullYear() - lastAccrual.getFullYear();
                return yearsSinceLastAccrual >= 1 ? 1 : 0;
            }
        }

        default:
            logger.warn(`[Leave Accrual Job] Unknown accrual frequency: ${accrualFrequency}`);
            return 0;
    }
}

/**
 * Calculate maximum accrued days for the year (pro-rata for mid-year joins)
 */
function calculateMaxAccruedDays(entitlement, policy, currentYear) {
    const yearStart = new Date(entitlement.yearStartDate);

    if (yearStart.getFullYear() === currentYear && yearStart.getMonth() > 0) {
        const monthsFromStart = 12 - yearStart.getMonth();
        const proRataDays = (policy.defaultDaysPerYear / 12) * monthsFromStart;
        return Math.min(proRataDays, policy.defaultDaysPerYear);
    }

    return policy.defaultDaysPerYear;
}

/**
 * Automation job for year-end processing
 * Runs on Jan 1st at 00:05 AM
 * Initializes new year entitlements for all employees and processes carryover
 */
export const startYearEndJob = async () => {
    let cron;
    try {
        const cronModule = await import("node-cron");
        cron = cronModule.default;
    } catch (error) {
        logger.warn("node-cron not installed. Year-end job will not run. Install with: npm install node-cron");
        return;
    }

    cron.schedule("5 0 1 1 *", async () => {
        const startTime = Date.now();
        const now = new Date();
        const newYear = now.getFullYear();
        const previousYear = newYear - 1;

        logger.info(`[Year-End Job] Starting year-end processing for year ${newYear} at ${now.toISOString()}`);

        try {
            const policies = await prisma.annualLeavePolicy.findMany({
                include: {
                    tenant: {
                        select: {
                            id: true,
                            name: true,
                        },
                    },
                },
            });

            logger.info(`[Year-End Job] Found ${policies.length} tenants with leave policies`);

            let totalProcessed = 0;
            let totalCreated = 0;
            let totalErrors = 0;

            for (const policy of policies) {
                try {
                    const activeEmployees = await prisma.user.findMany({
                        where: {
                            tenantId: policy.tenantId,
                            isDeleted: false,
                        },
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                        },
                    });

                    logger.info(
                        `[Year-End Job] Processing ${activeEmployees.length} employees for tenant ${policy.tenant.name} (${policy.tenantId})`
                    );

                    for (const employee of activeEmployees) {
                        try {
                            const previousYearEntitlement = await prisma.yearlyEntitlement.findUnique({
                                where: {
                                    tenantId_userId_year: {
                                        tenantId: policy.tenantId,
                                        userId: employee.id,
                                        year: previousYear,
                                    },
                                },
                            });

                            const existingNewYearEntitlement = await prisma.yearlyEntitlement.findUnique({
                                where: {
                                    tenantId_userId_year: {
                                        tenantId: policy.tenantId,
                                        userId: employee.id,
                                        year: newYear,
                                    },
                                },
                            });

                            if (existingNewYearEntitlement) {
                                logger.debug(
                                    `[Year-End Job] Entitlement for ${employee.name} (${employee.employeeId}) already exists for year ${newYear}, skipping`
                                );
                                continue;
                            }

                            const carryoverResult = calculateCarryover(previousYearEntitlement, policy);

                            const yearStartDate = new Date(newYear, 0, 1);
                            const yearEndDate = new Date(newYear, 11, 31, 23, 59, 59);

                            let allocatedDays = 0;
                            let accruedDays = 0;

                            if (policy.accrualMethod === "FRONT_LOADED") {
                                allocatedDays = policy.defaultDaysPerYear;
                                accruedDays = 0;
                            } else {
                                allocatedDays = 0;
                                accruedDays = 0;
                            }

                            let carryoverExpiryDate = null;
                            if (policy.carryoverExpiryMonths && carryoverResult.carriedOverDays > 0) {
                                carryoverExpiryDate = new Date(
                                    newYear,
                                    policy.carryoverExpiryMonths,
                                    0,
                                    23,
                                    59,
                                    59
                                );
                            }

                            await prisma.yearlyEntitlement.create({
                                data: {
                                    tenantId: policy.tenantId,
                                    userId: employee.id,
                                    policyId: policy.id,
                                    year: newYear,
                                    allocatedDays,
                                    accruedDays,
                                    carriedOverDays: carryoverResult.carriedOverDays,
                                    adjustmentDays: 0,
                                    usedDays: 0,
                                    pendingDays: 0,
                                    encashedDays: carryoverResult.encashedDays,
                                    encashmentAmount: carryoverResult.encashmentAmount,
                                    yearStartDate,
                                    yearEndDate,
                                    lastAccrualDate: null,
                                    carryoverExpiryDate,
                                },
                            });

                            totalCreated++;
                            totalProcessed++;

                            logger.info(
                                `[Year-End Job] Created entitlement for ${employee.name} (${employee.employeeId}): ` +
                                    `carriedOver=${carryoverResult.carriedOverDays.toFixed(2)}, ` +
                                    `encashed=${carryoverResult.encashedDays.toFixed(2)}, ` +
                                    `encashmentAmount=${carryoverResult.encashmentAmount.toFixed(2)}`
                            );
                        } catch (error) {
                            totalErrors++;
                            logger.error(
                                `[Year-End Job] Error processing employee ${employee.id} (${employee.employeeId}): ${error.message}`,
                                {
                                    error: error.stack,
                                    userId: employee.id,
                                    tenantId: policy.tenantId,
                                }
                            );
                        }
                    }
                } catch (error) {
                    totalErrors++;
                    logger.error(
                        `[Year-End Job] Error processing tenant ${policy.tenantId}: ${error.message}`,
                        {
                            error: error.stack,
                            tenantId: policy.tenantId,
                        }
                    );
                }
            }

            const duration = Date.now() - startTime;
            logger.info(
                `[Year-End Job] Completed in ${duration}ms. Processed: ${totalProcessed}, Created: ${totalCreated}, Errors: ${totalErrors}`
            );
        } catch (error) {
            logger.error(`[Year-End Job] Fatal error: ${error.message}`, {
                error: error.stack,
            });
        }
    });

    logger.info("[Year-End Job] Scheduled to run on Jan 1st at 00:05 AM");
};

/**
 * Calculate carryover from previous year entitlement based on policy
 */
function calculateCarryover(previousYearEntitlement, policy) {
    if (!previousYearEntitlement) {
        return {
            carriedOverDays: 0,
            encashedDays: 0,
            encashmentAmount: 0,
        };
    }

    const unusedDays =
        previousYearEntitlement.allocatedDays +
        previousYearEntitlement.accruedDays +
        previousYearEntitlement.carriedOverDays +
        previousYearEntitlement.adjustmentDays -
        previousYearEntitlement.usedDays -
        previousYearEntitlement.encashedDays;

    if (unusedDays <= 0) {
        return {
            carriedOverDays: 0,
            encashedDays: 0,
            encashmentAmount: 0,
        };
    }

    switch (policy.carryoverType) {
        case "NONE":
            return {
                carriedOverDays: 0,
                encashedDays: 0,
                encashmentAmount: 0,
            };

        case "FULL":
            return {
                carriedOverDays: unusedDays,
                encashedDays: 0,
                encashmentAmount: 0,
            };

        case "LIMITED": {
            const maxCarryover = policy.maxCarryoverDays || 0;
            const carriedOver = Math.min(unusedDays, maxCarryover);
            return {
                carriedOverDays: carriedOver,
                encashedDays: 0,
                encashmentAmount: 0,
            };
        }

        case "ENCASHMENT": {
            const encashmentRate = policy.encashmentRate || 0;
            const encashmentAmount = unusedDays * encashmentRate;
            return {
                carriedOverDays: 0,
                encashedDays: unusedDays,
                encashmentAmount: encashmentAmount,
            };
        }

        default:
            logger.warn(`[Year-End Job] Unknown carryover type: ${policy.carryoverType}`);
            return {
                carriedOverDays: 0,
                encashedDays: 0,
                encashmentAmount: 0,
            };
    }
}

/**
 * Automation job for carryover expiry check
 * Runs on 1st of each month at 2:00 AM
 * Forfeits expired carryover days based on carryoverExpiryDate
 */
export const startCarryoverExpiryJob = async () => {
    let cron;
    try {
        const cronModule = await import("node-cron");
        cron = cronModule.default;
    } catch (error) {
        logger.warn("node-cron not installed. Carryover expiry job will not run. Install with: npm install node-cron");
        return;
    }

    cron.schedule("0 2 1 * *", async () => {
        const startTime = Date.now();
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        logger.info(`[Carryover Expiry Job] Starting carryover expiry check at ${now.toISOString()}`);

        try {
            const entitlements = await prisma.yearlyEntitlement.findMany({
                where: {
                    carryoverExpiryDate: {
                        not: null,
                        lte: now,
                    },
                    carriedOverDays: {
                        gt: 0,
                    },
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                            email: true,
                        },
                    },
                    policy: {
                        select: {
                            id: true,
                            tenantId: true,
                            carryoverExpiryMonths: true,
                        },
                    },
                },
            });

            logger.info(`[Carryover Expiry Job] Found ${entitlements.length} entitlements with expired carryover`);

            let totalProcessed = 0;
            let totalForfeited = 0;
            let totalErrors = 0;

            for (const entitlement of entitlements) {
                try {
                    const expiredCarryover = entitlement.carriedOverDays;

                    await prisma.yearlyEntitlement.update({
                        where: { id: entitlement.id },
                        data: {
                            carriedOverDays: 0,
                        },
                    });

                    totalForfeited += expiredCarryover;
                    totalProcessed++;

                    logger.info(
                        `[Carryover Expiry Job] Forfeited ${expiredCarryover.toFixed(2)} expired carryover days for ${entitlement.user.name} (${entitlement.user.employeeId})`
                    );

                    await createNotification(
                        entitlement.policy.tenantId,
                        entitlement.userId,
                        "Carryover Leave Expired",
                        `Your ${expiredCarryover.toFixed(2)} carryover leave days have expired and have been forfeited.`,
                        "LEAVE",
                        null
                    );
                } catch (error) {
                    totalErrors++;
                    logger.error(
                        `[Carryover Expiry Job] Error processing entitlement ${entitlement.id} for user ${entitlement.userId}: ${error.message}`,
                        {
                            error: error.stack,
                            entitlementId: entitlement.id,
                            userId: entitlement.userId,
                        }
                    );
                }
            }

            const duration = Date.now() - startTime;
            logger.info(
                `[Carryover Expiry Job] Completed in ${duration}ms. Processed: ${totalProcessed}, Forfeited: ${totalForfeited.toFixed(2)} days, Errors: ${totalErrors}`
            );
        } catch (error) {
            logger.error(`[Carryover Expiry Job] Fatal error: ${error.message}`, {
                error: error.stack,
            });
        }
    });

    logger.info("[Carryover Expiry Job] Scheduled to run on 1st of each month at 2:00 AM");
};

/**
 * Automation job for leave ending notifications
 * Runs daily at 8:00 AM
 * Notifies employees whose approved leave ends soon (tomorrow or in 1-3 days)
 */
export const startLeaveEndingNotificationJob = async () => {
    let cron;
    try {
        const cronModule = await import("node-cron");
        cron = cronModule.default;
    } catch (error) {
        logger.warn("node-cron not installed. Leave ending notification job will not run. Install with: npm install node-cron");
        return;
    }

    cron.schedule("0 8 * * *", async () => {
        const startTime = Date.now();
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        const today = new Date(now);
        const threeDaysLater = new Date(now);
        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
        threeDaysLater.setHours(23, 59, 59, 999);

        logger.info(`[Leave Ending Notification Job] Starting leave ending notification check at ${now.toISOString()}`);

        try {
            const leaveRequests = await prisma.leaveRequest.findMany({
                where: {
                    status: "APPROVED",
                    endDate: {
                        gte: today,
                        lte: threeDaysLater,
                    },
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                            email: true,
                        },
                    },
                    leaveType: {
                        select: {
                            id: true,
                            name: true,
                            color: true,
                        },
                    },
                    tenant: {
                        select: {
                            id: true,
                        },
                    },
                },
            });

            logger.info(`[Leave Ending Notification Job] Found ${leaveRequests.length} leave requests ending soon`);

            let totalNotified = 0;
            let totalErrors = 0;

            for (const leaveRequest of leaveRequests) {
                try {
                    const startDate = new Date(leaveRequest.startDate);
                    const endDate = new Date(leaveRequest.endDate);
                    endDate.setHours(0, 0, 0, 0);
                    const daysUntilEnd = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

                    const formattedStartDate = startDate.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    });

                    const formattedEndDate = endDate.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    });

                    let message;
                    if (daysUntilEnd === 0) {
                        message = `Your ${leaveRequest.leaveType.name} leave ends today (${formattedEndDate}).`;
                    } else if (daysUntilEnd === 1) {
                        message = `Your ${leaveRequest.leaveType.name} leave ends tomorrow (${formattedEndDate}).`;
                    } else {
                        message = `Your ${leaveRequest.leaveType.name} leave ends in ${daysUntilEnd} days (${formattedEndDate}).`;
                    }

                    await createNotification(
                        leaveRequest.tenantId,
                        leaveRequest.userId,
                        "Leave Ending Soon",
                        message,
                        "LEAVE",
                        null
                    );

                    if (leaveRequest.user.email) {
                        try {
                            await sendLeaveEndingReminderEmail({
                                to: leaveRequest.user.email,
                                employeeName: leaveRequest.user.name || leaveRequest.user.employeeId || "Employee",
                                leaveTypeName: leaveRequest.leaveType.name,
                                totalDays: leaveRequest.totalDays,
                                formattedStartDate,
                                formattedEndDate,
                                daysUntilEnd,
                            });

                            logger.debug(
                                `[Leave Ending Notification Job] Email sent to ${leaveRequest.user.email} for leave ending in ${daysUntilEnd} day(s)`
                            );
                        } catch (emailError) {
                            logger.warn(
                                `[Leave Ending Notification Job] Failed to send email to ${leaveRequest.user.email}: ${emailError.message}`
                            );
                        }
                    }

                    totalNotified++;

                    logger.debug(
                        `[Leave Ending Notification Job] Notified ${leaveRequest.user.name} (${leaveRequest.user.employeeId}) - leave ends in ${daysUntilEnd} day(s)`
                    );
                } catch (error) {
                    totalErrors++;
                    logger.error(
                        `[Leave Ending Notification Job] Error processing leave request ${leaveRequest.id} for user ${leaveRequest.userId}: ${error.message}`,
                        {
                            error: error.stack,
                            leaveRequestId: leaveRequest.id,
                            userId: leaveRequest.userId,
                        }
                    );
                }
            }

            const duration = Date.now() - startTime;
            logger.info(
                `[Leave Ending Notification Job] Completed in ${duration}ms. Notified: ${totalNotified}, Errors: ${totalErrors}`
            );
        } catch (error) {
            logger.error(`[Leave Ending Notification Job] Fatal error: ${error.message}`, {
                error: error.stack,
            });
        }
    });

    logger.info("[Leave Ending Notification Job] Scheduled to run daily at 8:00 AM");
};

export const startAllLeaveAutomationJobs = async () => {
    await startLeaveAccrualJob();
    await startYearEndJob();
    await startCarryoverExpiryJob();
    await startLeaveEndingNotificationJob();
    logger.info("All leave automation jobs started");
};