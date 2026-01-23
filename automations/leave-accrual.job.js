import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

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
 */
export const startYearEndJob = async () => {
    // TODO: Implement
};

/**
 * Automation job for leave ending notifications
 * Runs daily at 8:00 AM
 */
export const startLeaveEndingNotificationJob = async () => {
    // TODO: Implement
};

export const startAllLeaveAutomationJobs = async () => {
    await startLeaveAccrualJob();
    await startYearEndJob();
    await startLeaveEndingNotificationJob();
    logger.info("All leave automation jobs started");
};