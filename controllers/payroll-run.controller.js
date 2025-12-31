import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import {
    processEmployeePayroll,
    queuePayrollRun,
    getActiveEmployeesForPayroll,
    calculatePayrollRunTotals,
    createOrUpdatePayslip,
} from "../services/payroll-run.service.js";
import { updatePayPeriodStatusAutomatically } from "../services/pay-period-automation.service.js";
import { getProgress, calculateEstimatedCompletion } from "../services/payroll-progress.service.js";
import { createSSEConnection } from "../utils/sse.utils.js";
import { generatePreview } from "../services/payroll-preview.service.js";
import { getJobStatus, getQueueMetrics, retryJob, PAYROLL_QUEUE_NAME, PAYROLL_EMPLOYEE_QUEUE_NAME } from "../queues/payroll.queue.js";
import {
    validateStatusTransition,
    getAvailableTransitions,
    getStateMeta,
} from "../utils/payroll-run.utils.js";

export const createPayrollRun = async (req, res) => {
    try {
        const { id: userId, tenantId } = req.user;
        const { payPeriodId, employeeIds } = req.body;

        if (!payPeriodId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "payPeriodId is required",
            });
        }

        // Verify pay period exists and belongs to tenant
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
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

        // Check if pay period is in valid status for processing
        if (payPeriod.status === "CLOSED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot create payroll run for closed pay period",
            });
        }

        // Get employees to process (if not specified, get all active employees)
        const employeesToProcess = await getActiveEmployeesForPayroll(
            tenantId,
            employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0 ? employeeIds : null
        );

        if (employeesToProcess.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No eligible employees found for payroll processing",
            });
        }

        // Create payroll run
        const payrollRun = await prisma.payrollRun.create({
            data: {
                tenantId,
                payPeriodId,
                processedBy: userId,
                status: "DRAFT",
                totalEmployees: 0,
            },
        });

        logger.info(`Created payroll run ${payrollRun.id} for pay period ${payPeriodId}`);
        await addLog(userId, tenantId, "CREATE", "PayrollRun", payrollRun.id, null, req);

        return res.status(201).json({
            success: true,
            data: payrollRun,
            message: "Payroll run created successfully",
        });
    } catch (error) {
        logger.error(`Error creating payroll run: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create payroll run",
        });
    }
};

export const startPayrollRun = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                payPeriod: true,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        // Validate status transition using state machine (preliminary check)
        const transition = validateStatusTransition(payrollRun.status, "PROCESSING", {
            totalEmployees: 0, // Will be validated after getting employee count
        });

        if (!transition.valid) {
            const availableTransitions = getAvailableTransitions(payrollRun.status);
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: transition.message,
                availableTransitions,
            });
        }

        // Business rule: Prevent concurrent payroll runs for the same pay period
        const concurrentRun = await prisma.payrollRun.findFirst({
            where: {
                payPeriodId: payrollRun.payPeriodId,
                tenantId,
                status: "PROCESSING",
                id: { not: id }, // Exclude current run
            },
        });

        if (concurrentRun) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "Another payroll run is already processing for this pay period. Please wait for it to complete.",
                data: {
                    concurrentRunId: concurrentRun.id,
                    startedAt: concurrentRun.processedAt,
                },
            });
        }

        // Get all active employees for this tenant
        const employeeIds = await getActiveEmployeesForPayroll(tenantId);

        if (employeeIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No eligible employees found for payroll processing",
            });
        }

        logger.info(`Starting payroll run ${id} with ${employeeIds.length} employees`);
        await addLog(userId, tenantId, "START_PAYROLL_RUN", "PayrollRun", id, {
            status: { before: "DRAFT", after: "PROCESSING" },
            processingMode: "queue",
            employeeCount: employeeIds.length,
        }, req);

        // Automatically update pay period status to PROCESSING
        try {
            await updatePayPeriodStatusAutomatically(payrollRun.payPeriodId, tenantId, "PROCESSING");
        } catch (autoError) {
            logger.warn(`Failed to auto-update pay period status: ${autoError.message}`);
        }

        // Queue payroll run for processing via BullMQ
        const queueResult = await queuePayrollRun(
            id,
            tenantId,
            payrollRun.payPeriodId,
            employeeIds,
            userId
        );

        const stateMeta = getStateMeta("PROCESSING");
        return res.status(200).json({
            success: true,
            data: {
                payrollRunId: id,
                status: "PROCESSING",
                processingMode: "queue",
                jobId: queueResult.jobId,
                employeeCount: employeeIds.length,
                availableTransitions: getAvailableTransitions("PROCESSING"),
                stateMeta,
            },
            message: "Payroll run queued successfully. Processing in background.",
        });
    } catch (error) {
        logger.error(`Error starting payroll run: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to start payroll run",
        });
    }
};

// NOTE: Sequential processing has been removed. All payroll processing now uses BullMQ queue-based processing.

export const getPayrollRuns = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { payPeriodId, status } = req.query;

        const where = {
            tenantId,
            ...(payPeriodId && { payPeriodId }),
            ...(status && { status }),
        };

        const payrollRuns = await prisma.payrollRun.findMany({
            where,
            include: {
                payPeriod: {
                    select: {
                        id: true,
                        periodName: true,
                        startDate: true,
                        endDate: true,
                    },
                },
                processor: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        payslips: true,
                    },
                },
            },
            orderBy: {
                runDate: "desc",
            },
        });

        logger.info(`Retrieved ${payrollRuns.length} payroll runs for tenant ${tenantId}`);

        return res.status(200).json({
            success: true,
            data: payrollRuns,
            count: payrollRuns.length,
        });
    } catch (error) {
        logger.error(`Error fetching payroll runs: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payroll runs",
        });
    }
};

export const getPayrollRunById = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                payPeriod: {
                    select: {
                        id: true,
                        periodName: true,
                        startDate: true,
                        endDate: true,
                        status: true,
                    },
                },
                processor: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                payslips: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                employeeId: true,
                            },
                        },
                    },
                    orderBy: {
                        netSalary: "desc",
                    },
                },
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        logger.info(`Retrieved payroll run ${id}`);

        const stateMeta = getStateMeta(payrollRun.status);
        return res.status(200).json({
            success: true,
            data: {
                ...payrollRun,
                availableTransitions: getAvailableTransitions(payrollRun.status),
                stateMeta,
            },
        });
    } catch (error) {
        logger.error(`Error fetching payroll run: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payroll run",
        });
    }
};

export const processSingleEmployee = async (req, res) => {
    try {
        const { id: payrollRunId } = req.params;
        const { employeeId } = req.body;
        const { id: userId, tenantId } = req.user;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "employeeId is required",
            });
        }

        // Verify payroll run exists and belongs to tenant
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id: payrollRunId,
                tenantId,
            },
            include: {
                payPeriod: true,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        // Check if payroll run is in valid status
        if (payrollRun.status === "CLOSED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot process employee for closed payroll run",
            });
        }

        // Process employee payroll
        const payslipData = await processEmployeePayroll(
            employeeId,
            payrollRun.payPeriodId,
            tenantId
        );

        // Check if employee already has a payslip in this run (for audit logging)
        const existingPayslip = await prisma.payslip.findFirst({
            where: {
                payrollRunId,
                userId: employeeId,
                isAdjustment: false,
            },
        });

        // Create or update payslip using shared function (include user data for response)
        const payslip = await createOrUpdatePayslip(
            payrollRunId,
            employeeId,
            payslipData,
            { includeUser: true }
        );

        // Recalculate payroll run totals using shared function
        const totals = await calculatePayrollRunTotals(payrollRunId);
        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                totalEmployees: totals.totalEmployees,
                totalGrossPay: totals.totalGrossPay,
                totalDeductions: totals.totalDeductions,
                totalNetPay: totals.totalNetPay,
            },
        });

        logger.info(`Processed payroll for employee ${employeeId} in run ${payrollRunId}`);
        await addLog(
            userId,
            tenantId,
            existingPayslip ? "UPDATE" : "PROCESS",
            "Payslip",
            payslip.id,
            existingPayslip
                ? {
                    grossSalary: {
                        before: existingPayslip.grossSalary,
                        after: payslipData.grossSalary,
                    },
                    netSalary: {
                        before: existingPayslip.netSalary,
                        after: payslipData.netSalary,
                    },
                }
                : null,
            req
        );

        return res.status(200).json({
            success: true,
            data: payslip,
            message: existingPayslip
                ? "Employee payroll updated successfully"
                : "Employee payroll processed successfully",
        });
    } catch (error) {
        logger.error(`Error processing single employee payroll: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            employeeId: req.body?.employeeId,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: error.message || "Failed to process employee payroll",
        });
    }
};

export const getPayrollRunStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                progress: true,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        const progress = payrollRun.progress;
        if (!progress) {
            return res.status(200).json({
                success: true,
                data: {
                    status: payrollRun.status,
                    progress: null,
                    message: "Progress tracking not initialized",
                },
            });
        }

        const percentage =
            progress.totalEmployees > 0
                ? Math.round((progress.completedEmployees / progress.totalEmployees) * 100)
                : 0;

        const estimatedCompletion = await calculateEstimatedCompletion(id);

        const stateMeta = getStateMeta(payrollRun.status);
        return res.status(200).json({
            success: true,
            data: {
                status: payrollRun.status,
                progress: {
                    completed: progress.completedEmployees,
                    total: progress.totalEmployees,
                    failed: progress.failedEmployees,
                    percentage,
                },
                estimatedCompletion: estimatedCompletion?.toISOString() || null,
                startedAt: progress.startedAt.toISOString(),
                lastUpdatedAt: progress.lastUpdatedAt.toISOString(),
                availableTransitions: getAvailableTransitions(payrollRun.status),
                stateMeta,
            },
        });
    } catch (error) {
        logger.error(`Error fetching payroll run status: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payroll run status",
        });
    }
};

export const getPayrollRunStatusStream = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        const sse = createSSEConnection(res, () => {
            logger.info(`SSE connection closed for payroll run ${id}`);
        });

        // Send initial status
        const progress = await getProgress(id);
        if (progress) {
            const percentage =
                progress.totalEmployees > 0
                    ? Math.round((progress.completedEmployees / progress.totalEmployees) * 100)
                    : 0;
            const estimatedCompletion = await calculateEstimatedCompletion(id);

            sse.send({
                status: payrollRun.status,
                progress: {
                    completed: progress.completedEmployees,
                    total: progress.totalEmployees,
                    failed: progress.failedEmployees,
                    percentage,
                },
                estimatedCompletion: estimatedCompletion?.toISOString() || null,
            });
        } else {
            sse.send({
                status: payrollRun.status,
                progress: null,
                message: "Progress tracking not initialized",
            });
        }

        // Poll for updates every 2 seconds
        const pollInterval = setInterval(async () => {
            try {
                const currentRun = await prisma.payrollRun.findUnique({
                    where: { id },
                    include: { progress: true },
                });

                if (!currentRun) {
                    clearInterval(pollInterval);
                    sse.close();
                    return;
                }

                // If completed or failed, send final update and close
                if (currentRun.status === "COMPLETED" || currentRun.status === "FAILED") {
                    const finalProgress = currentRun.progress;
                    if (finalProgress) {
                        const percentage =
                            finalProgress.totalEmployees > 0
                                ? Math.round(
                                    (finalProgress.completedEmployees / finalProgress.totalEmployees) * 100
                                )
                                : 100;

                        sse.send({
                            status: currentRun.status,
                            progress: {
                                completed: finalProgress.completedEmployees,
                                total: finalProgress.totalEmployees,
                                failed: finalProgress.failedEmployees,
                                percentage,
                            },
                        });
                    }
                    clearInterval(pollInterval);
                    sse.close();
                    return;
                }

                // Send progress update
                if (currentRun.progress) {
                    const percentage =
                        currentRun.progress.totalEmployees > 0
                            ? Math.round(
                                (currentRun.progress.completedEmployees / currentRun.progress.totalEmployees) *
                                100
                            )
                            : 0;
                    const estimatedCompletion = await calculateEstimatedCompletion(id);

                    sse.send({
                        status: currentRun.status,
                        progress: {
                            completed: currentRun.progress.completedEmployees,
                            total: currentRun.progress.totalEmployees,
                            failed: currentRun.progress.failedEmployees,
                            percentage,
                        },
                        estimatedCompletion: estimatedCompletion?.toISOString() || null,
                    });
                }
            } catch (pollError) {
                logger.error(`Error polling progress: ${pollError.message}`, {
                    error: pollError.stack,
                    payrollRunId: id,
                });
            }
        }, 2000);

        // Cleanup on client disconnect
        res.on("close", () => {
            clearInterval(pollInterval);
        });
    } catch (error) {
        logger.error(`Error setting up SSE stream: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: "Internal Server Error",
                message: "Failed to setup status stream",
            });
        }
    }
};

export const previewPayrollRun = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { payPeriodId, employeeIds } = req.body;

        if (!payPeriodId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "payPeriodId is required",
            });
        }

        const preview = await generatePreview(payPeriodId, employeeIds, tenantId);

        logger.info(`Generated payroll preview for pay period ${payPeriodId}`, {
            tenantId,
            eligibleCount: preview.eligibleCount,
        });

        return res.status(200).json({
            success: true,
            data: preview,
        });
    } catch (error) {
        logger.error(`Error generating payroll preview: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: error.message || "Failed to generate payroll preview",
        });
    }
};

// ============================================================================
// Queue-related endpoints (BullMQ)
// ============================================================================

/**
 * Get queue job status by payroll run ID
 */
export const getPayrollJobStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        // Find payroll run to get queue job ID
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
            select: {
                id: true,
                status: true,
                queueJobId: true,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        if (!payrollRun.queueJobId) {
            return res.status(200).json({
                success: true,
                data: {
                    payrollRunId: id,
                    status: payrollRun.status,
                    queueJob: null,
                    message: "No queue job associated with this payroll run",
                },
            });
        }

        // Get job status from queue
        const jobStatus = await getJobStatus(payrollRun.queueJobId);

        return res.status(200).json({
            success: true,
            data: {
                payrollRunId: id,
                status: payrollRun.status,
                queueJob: jobStatus,
            },
        });
    } catch (error) {
        logger.error(`Error fetching payroll job status: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payroll job status",
        });
    }
};

/**
 * Get queue metrics
 */
export const getPayrollQueueMetrics = async (req, res) => {
    try {
        const metrics = await getQueueMetrics();

        return res.status(200).json({
            success: true,
            data: {
                enabled: true,
                ...metrics,
            },
        });
    } catch (error) {
        logger.error(`Error fetching queue metrics: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch queue metrics",
        });
    }
};

/**
 * Retry a failed payroll job
 */
export const retryPayrollJob = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        // Find payroll run to get queue job ID
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
            select: {
                id: true,
                status: true,
                queueJobId: true,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        // Validate status transition using state machine
        const transition = validateStatusTransition(payrollRun.status, "PROCESSING", {
            totalEmployees: 0, // Retry doesn't need employee count validation
        });

        if (!transition.valid) {
            const availableTransitions = getAvailableTransitions(payrollRun.status);
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: transition.message,
                availableTransitions,
            });
        }

        if (!payrollRun.queueJobId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No queue job associated with this payroll run",
            });
        }

        const success = await retryJob(PAYROLL_QUEUE_NAME, payrollRun.queueJobId);

        if (!success) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Failed to retry job - job not found in queue",
            });
        }

        // Update payroll run status
        await prisma.payrollRun.update({
            where: { id },
            data: {
                status: "PROCESSING",
            },
        });

        logger.info(`Retried payroll run ${id}`, {
            userId,
            tenantId,
            jobId: payrollRun.queueJobId,
        });

        await addLog(userId, tenantId, "RESUME", "PayrollRun", id, {
            status: { before: "FAILED", after: "PROCESSING" },
            action: "retry",
        }, req);

        const stateMeta = getStateMeta("PROCESSING");
        return res.status(200).json({
            success: true,
            data: {
                payrollRunId: id,
                status: "PROCESSING",
                availableTransitions: getAvailableTransitions("PROCESSING"),
                stateMeta,
            },
            message: "Payroll run retry initiated",
        });
    } catch (error) {
        logger.error(`Error retrying payroll job: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to retry payroll job",
        });
    }
};

/**
 * Get queue configuration info
 */
export const getQueueConfig = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            data: {
                enabled: true,
                queues: {
                    payrollRun: PAYROLL_QUEUE_NAME,
                    employeeProcessing: PAYROLL_EMPLOYEE_QUEUE_NAME,
                },
                workerConcurrency: parseInt(process.env.PAYROLL_WORKER_CONCURRENCY, 10) || 5,
                retryConfig: {
                    maxAttempts: 3,
                    backoffType: "exponential",
                    backoffDelay: 2000,
                },
            },
        });
    } catch (error) {
        logger.error(`Error fetching queue config: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch queue configuration",
        });
    }
};

