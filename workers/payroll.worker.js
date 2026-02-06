import { Worker } from "bullmq";
import { getRedisConnection } from "../config/redis.config.js";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import {
    processEmployeePayroll,
    finalizePayrollRun,
    createOrUpdatePayslip,
} from "../services/payroll-run.service.js";
import { createProgress, updateProgress } from "../services/payroll-progress.service.js";
import { generatePayslipFromRecord } from "../services/payslip-generator.service.js";
import {
    PAYROLL_QUEUE_NAME,
    PAYROLL_EMPLOYEE_QUEUE_NAME,
    addEmployeePayrollJobs,
} from "../queues/payroll.queue.js";
import { validateStatusTransition } from "../utils/payroll-run.utils.js";

// Worker configuration
const WORKER_CONCURRENCY = parseInt(process.env.PAYROLL_WORKER_CONCURRENCY, 10) || 5;
const PROGRESS_UPDATE_INTERVAL = 5; // Update progress every N employees

let payrollWorker = null;
let employeeWorker = null;

/**
 * Process a payroll run job (parent job)
 * This job spawns individual employee jobs
 */
const processPayrollRunJob = async (job) => {
    const { payrollRunId, tenantId, payPeriodId, employeeIds, processedBy, totalEmployees } = job.data;

    logger.info(`Processing payroll run job`, {
        jobId: job.id,
        payrollRunId,
        employeeCount: totalEmployees,
    });

    try {
        // Update payroll run status to PROCESSING
        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                status: "PROCESSING",
                queueJobId: job.id,
                processedBy,
                processedAt: new Date(),
            },
        });

        // Initialize progress tracking
        try {
            await createProgress(payrollRunId, totalEmployees);
        } catch (progressError) {
            logger.warn(`Failed to create progress tracking: ${progressError.message}`);
        }

        // Add individual employee jobs to the queue
        await addEmployeePayrollJobs(payrollRunId, payPeriodId, tenantId, employeeIds);

        // Update job progress
        await job.updateProgress(10); // 10% - jobs queued

        logger.info(`Payroll run job spawned employee jobs`, {
            jobId: job.id,
            payrollRunId,
            employeeCount: totalEmployees,
        });

        // Return metadata - actual processing happens in employee jobs
        return {
            status: "processing",
            payrollRunId,
            employeeJobsQueued: totalEmployees,
        };
    } catch (error) {
        logger.error(`Error in payroll run job`, {
            jobId: job.id,
            payrollRunId,
            error: error.message,
            stack: error.stack,
        });

        const currentRun = await prisma.payrollRun.findUnique({
            where: { id: payrollRunId },
            select: { status: true },
        });
        const transition = validateStatusTransition(
            currentRun?.status ?? "PROCESSING",
            "FAILED",
            {}
        );
        if (transition.valid) {
            await prisma.payrollRun.update({
                where: { id: payrollRunId },
                data: { status: "FAILED" },
            });
        } else {
            logger.warn(`Payroll run ${payrollRunId} FAILED transition rejected by state machine`, {
                payrollRunId,
                currentStatus: currentRun?.status,
                message: transition.message,
            });
        }

        throw error;
    }
};

/**
 * Process an individual employee payroll job
 */
const processEmployeeJob = async (job) => {
    const { payrollRunId, payPeriodId, tenantId, employeeId, index, total } = job.data;

    logger.debug(`Processing employee payroll`, {
        jobId: job.id,
        payrollRunId,
        employeeId,
        progress: `${index + 1}/${total}`,
    });

    try {
        // Process employee payroll
        const payslipData = await processEmployeePayroll(employeeId, payPeriodId, tenantId);

        // Create or update payslip record using shared function
        const payslip = await createOrUpdatePayslip(payrollRunId, employeeId, payslipData);

        // Generate PDF asynchronously (don't block processing)
        generatePayslipFromRecord(payslip.id, tenantId).catch((pdfError) => {
            logger.error(`Failed to generate PDF for payslip ${payslip.id}: ${pdfError.message}`);
        });

        // Update progress periodically
        if ((index + 1) % PROGRESS_UPDATE_INTERVAL === 0 || index === total - 1) {
            await updatePayrollProgress(payrollRunId);
        }

        // Update job progress
        const progress = Math.round(((index + 1) / total) * 100);
        await job.updateProgress(progress);

        return {
            success: true,
            payslipId: payslip.id,
            employeeId,
            netSalary: payslipData.netSalary,
        };
    } catch (error) {
        logger.error(`Error processing employee ${employeeId}`, {
            jobId: job.id,
            payrollRunId,
            employeeId,
            error: error.message,
        });

        // Update failed count
        await updatePayrollProgress(payrollRunId, true);

        throw error;
    }
};

/**
 * Update payroll run progress from payslip counts
 */
const updatePayrollProgress = async (payrollRunId, isFailed = false) => {
    try {
        const [payrollRun, completedCount, totalCount] = await Promise.all([
            prisma.payrollRun.findUnique({
                where: { id: payrollRunId },
                select: { status: true },
            }),
            prisma.payslip.count({
                where: { payrollRunId },
            }),
            prisma.payrollProgress.findUnique({
                where: { payrollRunId },
                select: { totalEmployees: true, failedEmployees: true },
            }),
        ]);

        if (!totalCount) return;

        const failedEmployees = isFailed
            ? (totalCount.failedEmployees || 0) + 1
            : totalCount.failedEmployees || 0;

        await updateProgress(payrollRunId, {
            completedEmployees: completedCount,
            failedEmployees,
        });

        // Check if all employees are processed
        const totalProcessed = completedCount + failedEmployees;
        if (totalProcessed >= totalCount.totalEmployees && payrollRun?.status === "PROCESSING") {
            // Use shared finalization function with failure checking and pay period update
            await finalizePayrollRun(payrollRunId, {
                checkFailures: true,
                updatePayPeriod: true,
            });
        }
    } catch (error) {
        logger.warn(`Failed to update payroll progress: ${error.message}`);
    }
};

// NOTE: finalizePayrollRun is now imported from payroll-run.service.js
// This ensures consistent finalization logic across all processing paths

/**
 * Start the payroll run worker
 */
export const startPayrollWorker = () => {
    if (payrollWorker) {
        logger.warn("Payroll worker already running");
        return payrollWorker;
    }

    const connection = getRedisConnection();

    payrollWorker = new Worker(PAYROLL_QUEUE_NAME, processPayrollRunJob, {
        connection,
        concurrency: 1, // Only process one payroll run at a time
        limiter: {
            max: 10, // Max 10 payroll runs per hour
            duration: 60 * 60 * 1000,
        },
    });

    payrollWorker.on("completed", (job, result) => {
        logger.info(`Payroll run job completed`, {
            jobId: job.id,
            payrollRunId: job.data.payrollRunId,
        });
    });

    payrollWorker.on("failed", (job, error) => {
        logger.error(`Payroll run job failed`, {
            jobId: job?.id,
            payrollRunId: job?.data?.payrollRunId,
            error: error.message,
            attemptsMade: job?.attemptsMade,
        });
    });

    payrollWorker.on("error", (error) => {
        logger.error("Payroll worker error:", error.message);
    });

    logger.info("Payroll run worker started");
    return payrollWorker;
};

/**
 * Start the employee processing worker
 */
export const startEmployeeWorker = () => {
    if (employeeWorker) {
        logger.warn("Employee worker already running");
        return employeeWorker;
    }

    const connection = getRedisConnection();

    employeeWorker = new Worker(PAYROLL_EMPLOYEE_QUEUE_NAME, processEmployeeJob, {
        connection,
        concurrency: WORKER_CONCURRENCY,
    });

    employeeWorker.on("completed", (job, result) => {
        logger.debug(`Employee job completed`, {
            jobId: job.id,
            employeeId: job.data.employeeId,
            payrollRunId: job.data.payrollRunId,
        });
    });

    employeeWorker.on("failed", (job, error) => {
        logger.error(`Employee job failed`, {
            jobId: job?.id,
            employeeId: job?.data?.employeeId,
            payrollRunId: job?.data?.payrollRunId,
            error: error.message,
            attemptsMade: job?.attemptsMade,
        });
    });

    employeeWorker.on("error", (error) => {
        logger.error("Employee worker error:", error.message);
    });

    logger.info(`Employee processing worker started with concurrency ${WORKER_CONCURRENCY}`);
    return employeeWorker;
};

/**
 * Start all payroll workers
 */
export const startAllWorkers = () => {
    startPayrollWorker();
    startEmployeeWorker();
    logger.info("All payroll workers started");
};

/**
 * Stop all workers gracefully
 */
export const stopAllWorkers = async () => {
    const promises = [];

    if (payrollWorker) {
        promises.push(payrollWorker.close());
        payrollWorker = null;
    }

    if (employeeWorker) {
        promises.push(employeeWorker.close());
        employeeWorker = null;
    }

    await Promise.all(promises);
    logger.info("All payroll workers stopped");
};

export default {
    startPayrollWorker,
    startEmployeeWorker,
    startAllWorkers,
    stopAllWorkers,
};

