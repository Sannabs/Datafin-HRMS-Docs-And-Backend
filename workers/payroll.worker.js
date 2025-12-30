import { Worker } from "bullmq";
import { getRedisConnection } from "../config/redis.config.js";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { processEmployeePayroll } from "../services/payroll-run.service.js";
import { createProgress, updateProgress } from "../services/payroll-progress.service.js";
import { generatePayslipFromRecord } from "../services/payslip-generator.service.js";
import { updatePayPeriodStatusAutomatically } from "../services/pay-period-automation.service.js";
import {
    PAYROLL_QUEUE_NAME,
    PAYROLL_EMPLOYEE_QUEUE_NAME,
    addEmployeePayrollJobs,
} from "../queues/payroll.queue.js";

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

        // Mark payroll run as failed
        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: { status: "FAILED" },
        });

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

        // Check for existing non-adjustment payslip
        const existingPayslip = await prisma.payslip.findFirst({
            where: {
                payrollRunId,
                userId: employeeId,
                isAdjustment: false,
            },
        });

        // Create or update payslip record (with warning flags if applicable)
        let payslip;
        if (existingPayslip) {
            payslip = await prisma.payslip.update({
                where: { id: existingPayslip.id },
                data: {
                    grossSalary: payslipData.grossSalary,
                    totalAllowances: payslipData.totalAllowances,
                    totalDeductions: payslipData.totalDeductions,
                    netSalary: payslipData.netSalary,
                    hasWarnings: !!payslipData.warnings,
                    warnings: payslipData.warnings || null,
                },
            });
        } else {
            payslip = await prisma.payslip.create({
                data: {
                    payrollRunId,
                    userId: employeeId,
                    grossSalary: payslipData.grossSalary,
                    totalAllowances: payslipData.totalAllowances,
                    totalDeductions: payslipData.totalDeductions,
                    netSalary: payslipData.netSalary,
                    hasWarnings: !!payslipData.warnings,
                    warnings: payslipData.warnings || null,
                },
            });
        }

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
            await finalizePayrollRun(payrollRunId);
        }
    } catch (error) {
        logger.warn(`Failed to update payroll progress: ${error.message}`);
    }
};

/**
 * Finalize payroll run after all employees are processed
 */
const finalizePayrollRun = async (payrollRunId) => {
    try {
        // Calculate totals from payslips
        const payslips = await prisma.payslip.findMany({
            where: { payrollRunId },
            select: {
                grossSalary: true,
                totalDeductions: true,
                netSalary: true,
            },
        });

        const totalGrossPay = payslips.reduce((sum, p) => sum + p.grossSalary, 0);
        const totalDeductions = payslips.reduce((sum, p) => sum + p.totalDeductions, 0);
        const totalNetPay = payslips.reduce((sum, p) => sum + p.netSalary, 0);

        // Get progress to check for failures
        const progress = await prisma.payrollProgress.findUnique({
            where: { payrollRunId },
        });

        // Determine final status
        const hasFailed = progress && progress.failedEmployees > 0;
        const finalStatus = hasFailed ? "FAILED" : "COMPLETED";

        // Update payroll run
        const updatedRun = await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                status: finalStatus,
                totalEmployees: payslips.length,
                totalGrossPay,
                totalDeductions,
                totalNetPay,
            },
            include: {
                payPeriod: true,
            },
        });

        logger.info(`Finalized payroll run`, {
            payrollRunId,
            status: finalStatus,
            totalEmployees: payslips.length,
            totalGrossPay,
            totalNetPay,
        });

        // Update pay period status automatically
        if (updatedRun.payPeriod) {
            await updatePayPeriodStatusAutomatically(updatedRun.payPeriod.id, updatedRun.tenantId);
        }
    } catch (error) {
        logger.error(`Failed to finalize payroll run: ${error.message}`, {
            payrollRunId,
            error: error.stack,
        });
    }
};

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

