import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import {
    recalculateSalary,
    calculateAllowanceAmount,
    calculateDeductionAmount,
} from "../calculations/salary-calculations.js";
import { createProgress, updateProgress } from "./payroll-progress.service.js";
import { generatePayslipFromRecord } from "./payslip-generator.service.js";
import { addPayrollRunJob } from "../queues/payroll.queue.js";

// Feature flag for BullMQ queue processing
export const USE_BULLMQ = process.env.ENABLE_BULLMQ_QUEUE === "true";

/**
 * Process payroll for a single employee and generate payslip
 * @param {string} employeeId - Employee ID
 * @param {string} payPeriodId - Pay period ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Payslip data
 */
export const processEmployeePayroll = async (employeeId, payPeriodId, tenantId) => {
    try {
        // Get employee with active salary structure
        const employee = await prisma.user.findFirst({
            where: {
                id: employeeId,
                tenantId,
                isDeleted: false,
                status: "ACTIVE",
            },
            select: {
                id: true,
                name: true,
                departmentId: true,
                positionId: true,
                employmentType: true,
                status: true,
                hireDate: true,
            },
        });

        if (!employee) {
            throw new Error(`Employee ${employeeId} not found or not active`);
        }

        // Get pay period to check dates
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
                tenantId,
            },
        });

        if (!payPeriod) {
            throw new Error(`Pay period ${payPeriodId} not found`);
        }

        // Get active salary structure for the pay period
        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                userId: employeeId,
                tenantId,
                effectiveDate: { lte: payPeriod.endDate },
                OR: [
                    { endDate: null },
                    { endDate: { gte: payPeriod.startDate } },
                ],
            },
            include: {
                allowances: {
                    include: {
                        allowanceType: true,
                    },
                },
                deductions: {
                    include: {
                        deductionType: true,
                    },
                },
            },
            orderBy: {
                effectiveDate: "desc",
            },
        });

        if (!salaryStructure) {
            throw new Error(`No active salary structure found for employee ${employeeId}`);
        }

        // Build employee context for conditional calculations
        const employeeContext = {
            departmentId: employee.departmentId,
            positionId: employee.positionId,
            employmentType: employee.employmentType,
            baseSalary: salaryStructure.baseSalary,
            status: employee.status,
            hireDate: employee.hireDate,
        };

        // Calculate gross and net salary (with warning detection)
        const salaryResult = await recalculateSalary(
            salaryStructure.baseSalary,
            salaryStructure.allowances,
            salaryStructure.deductions,
            employeeContext,
            tenantId
        );

        const { grossSalary, netSalary, warnings } = salaryResult;

        // Log warning if deductions exceed gross salary
        if (warnings?.hasNegativeNetSalary) {
            logger.warn(`Negative net salary detected for employee ${employeeId}: ${warnings.message}`, {
                employeeId,
                grossSalary,
                originalNetSalary: warnings.originalNetSalary,
                adjustedNetSalary: netSalary,
            });
        }

        // Calculate total allowances and deductions
        let totalAllowances = 0;
        for (const allowance of salaryStructure.allowances) {
            const amount = await calculateAllowanceAmount(
                allowance,
                salaryStructure.baseSalary,
                employeeContext,
                grossSalary,
                tenantId
            );
            totalAllowances += amount;
        }

        let totalDeductions = 0;
        for (const deduction of salaryStructure.deductions) {
            const amount = await calculateDeductionAmount(
                deduction,
                grossSalary,
                salaryStructure.baseSalary,
                employeeContext,
                tenantId
            );
            totalDeductions += amount;
        }

        return {
            employeeId: employee.id,
            grossSalary,
            totalAllowances,
            totalDeductions,
            netSalary,
            warnings: warnings?.hasNegativeNetSalary ? warnings : null,
        };
    } catch (error) {
        logger.error(`Error processing payroll for employee ${employeeId}: ${error.message}`, {
            error: error.stack,
            employeeId,
            payPeriodId,
            tenantId,
        });
        throw error;
    }
};

/**
 * Process payroll run for multiple employees
 * @param {string} payrollRunId - Payroll run ID
 * @param {Array<string>} employeeIds - Array of employee IDs to process
 * @returns {Promise<Object>} Processing results
 */
export const processPayrollRun = async (payrollRunId, employeeIds) => {
    try {
        const payrollRun = await prisma.payrollRun.findUnique({
            where: { id: payrollRunId },
            include: {
                payPeriod: true,
            },
        });

        if (!payrollRun) {
            throw new Error(`Payroll run ${payrollRunId} not found`);
        }

        const { tenantId, payPeriodId } = payrollRun;
        const results = {
            processed: 0,
            failed: 0,
            errors: [],
            payslips: [],
        };

        // Initialize progress tracking
        try {
            await createProgress(payrollRunId, employeeIds.length);
        } catch (progressError) {
            logger.warn(`Failed to create progress tracking: ${progressError.message}`);
        }

        const PROGRESS_UPDATE_INTERVAL = 5; // Update progress every 5 employees
        let lastProgressUpdate = 0;

        // Process each employee
        for (let i = 0; i < employeeIds.length; i++) {
            const employeeId = employeeIds[i];
            try {
                const payslipData = await processEmployeePayroll(employeeId, payPeriodId, tenantId);

                // Create payslip record (with warning flags if applicable)
                const payslip = await prisma.payslip.create({
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

                // Generate PDF asynchronously (don't block processing)
                generatePayslipFromRecord(payslip.id, tenantId).catch((pdfError) => {
                    logger.error(`Failed to generate PDF for payslip ${payslip.id}: ${pdfError.message}`, {
                        error: pdfError.stack,
                        payslipId: payslip.id,
                    });
                });

                results.payslips.push(payslip);
                results.processed += 1;

                // Update progress periodically (every N employees or at end)
                if (i - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL || i === employeeIds.length - 1) {
                    try {
                        await updateProgress(payrollRunId, {
                            completedEmployees: results.processed,
                            failedEmployees: results.failed,
                        });
                        lastProgressUpdate = i;
                    } catch (progressError) {
                        logger.warn(`Failed to update progress: ${progressError.message}`);
                    }
                }
            } catch (error) {
                results.failed += 1;
                results.errors.push({
                    employeeId,
                    error: error.message,
                });
                logger.error(`Failed to process employee ${employeeId}: ${error.message}`);

                // Update progress on failure
                if (i - lastProgressUpdate >= PROGRESS_UPDATE_INTERVAL || i === employeeIds.length - 1) {
                    try {
                        await updateProgress(payrollRunId, {
                            completedEmployees: results.processed,
                            failedEmployees: results.failed,
                        });
                        lastProgressUpdate = i;
                    } catch (progressError) {
                        logger.warn(`Failed to update progress: ${progressError.message}`);
                    }
                }
            }
        }

        // Final progress update
        try {
            await updateProgress(payrollRunId, {
                completedEmployees: results.processed,
                failedEmployees: results.failed,
            });
        } catch (progressError) {
            logger.warn(`Failed to finalize progress: ${progressError.message}`);
        }

        // Update payroll run totals
        const totalGrossPay = results.payslips.reduce((sum, p) => sum + p.grossSalary, 0);
        const totalDeductions = results.payslips.reduce((sum, p) => sum + p.totalDeductions, 0);
        const totalNetPay = results.payslips.reduce((sum, p) => sum + p.netSalary, 0);

        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                totalEmployees: results.processed,
                totalGrossPay,
                totalDeductions,
                totalNetPay,
            },
        });

        return results;
    } catch (error) {
        logger.error(`Error processing payroll run ${payrollRunId}: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        throw error;
    }
};

/**
 * Queue a payroll run for async processing via BullMQ
 * @param {string} payrollRunId - Payroll run ID
 * @param {string} tenantId - Tenant ID
 * @param {string} payPeriodId - Pay period ID
 * @param {Array<string>} employeeIds - Array of employee IDs
 * @param {string} processedBy - User ID who started the run
 * @returns {Promise<Object>} Queue job info
 */
export const queuePayrollRun = async (payrollRunId, tenantId, payPeriodId, employeeIds, processedBy) => {
    if (!USE_BULLMQ) {
        throw new Error("BullMQ queue processing is not enabled. Set ENABLE_BULLMQ_QUEUE=true");
    }

    try {
        const job = await addPayrollRunJob({
            payrollRunId,
            tenantId,
            payPeriodId,
            employeeIds,
            processedBy,
        });

        // Update payroll run with queue job ID
        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                queueJobId: job.id,
            },
        });

        logger.info(`Queued payroll run ${payrollRunId}`, {
            jobId: job.id,
            employeeCount: employeeIds.length,
        });

        return {
            jobId: job.id,
            payrollRunId,
            employeeCount: employeeIds.length,
            status: "queued",
        };
    } catch (error) {
        logger.error(`Error queuing payroll run ${payrollRunId}: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        throw error;
    }
};

