import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { getSalaryBreakdownItemized } from "../calculations/salary-calculations.js";
import {
    computeOvertimePayAmount,
    getOvertimePayrollState,
    OvertimeNotApprovedError,
} from "../utils/overtime-payroll.util.js";
import { createProgress, updateProgress } from "./payroll-progress.service.js";
import { generatePayslipFromRecord } from "./payslip-generator.service.js";
import { addPayrollRunJob } from "../queues/payroll.queue.js";
import { updatePayPeriodStatusAutomatically } from "./pay-period-automation.service.js";
import { validateStatusTransition } from "../utils/payroll-run.utils.js";
import {
    buildGambiaEmployerContributionLines,
    resolveEmployerSocialSecurityRatePercent,
} from "../constants/gambia-payroll.defaults.js";

/**
 * Get active employees for payroll processing
 * @param {string} tenantId - Tenant ID
 * @param {Array<string>} employeeIds - Optional specific employee IDs to filter
 * @returns {Promise<Array<string>>} Array of employee IDs
 */
export const getActiveEmployeesForPayroll = async (tenantId, employeeIds = null) => {
    try {
        const where = {
            tenantId,
            isDeleted: false,
            status: "ACTIVE",
            ...(employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0
                ? { id: { in: employeeIds } }
                : {}),
        };

        const employees = await prisma.user.findMany({
            where,
            select: { id: true },
        });

        return employees.map((e) => e.id);
    } catch (error) {
        logger.error(`Error fetching active employees: ${error.message}`, {
            error: error.stack,
            tenantId,
        });
        throw error;
    }
};

/**
 * Calculate payroll run totals from payslips
 * @param {string} payrollRunId - Payroll run ID
 * @returns {Promise<Object>} Totals object
 */
export const calculatePayrollRunTotals = async (payrollRunId) => {
    try {
        const payslips = await prisma.payslip.findMany({
            where: { payrollRunId },
            select: {
                grossSalary: true,
                totalAllowances: true,
                totalDeductions: true,
                netSalary: true,
            },
        });

        const totalGrossPay = payslips.reduce((sum, p) => sum + Number(p.grossSalary), 0);
        const totalAllowances = payslips.reduce((sum, p) => sum + Number(p.totalAllowances), 0);
        const totalDeductions = payslips.reduce((sum, p) => sum + Number(p.totalDeductions), 0);
        const totalNetPay = payslips.reduce((sum, p) => sum + Number(p.netSalary), 0);
        const totalEmployees = payslips.length;

        return {
            totalGrossPay,
            totalAllowances,
            totalDeductions,
            totalNetPay,
            totalEmployees,
        };
    } catch (error) {
        logger.error(`Error calculating payroll run totals: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        throw error;
    }
};

/**
 * Finalize a payroll run by calculating totals and updating status
 * @param {string} payrollRunId - Payroll run ID
 * @param {Object} options - Finalization options
 * @param {boolean} options.checkFailures - Check for failed employees to determine status
 * @param {boolean} options.updatePayPeriod - Auto-update pay period status
 * @returns {Promise<Object>} Updated payroll run
 */
export const finalizePayrollRun = async (payrollRunId, options = {}) => {
    try {
        const { checkFailures = false, updatePayPeriod = false } = options;

        // Calculate totals from payslips
        const totals = await calculatePayrollRunTotals(payrollRunId);

        // Determine status if checking for failures (validate via state machine)
        let finalStatus = null;
        if (checkFailures) {
            const [currentRun, progress] = await Promise.all([
                prisma.payrollRun.findUnique({
                    where: { id: payrollRunId },
                    select: { status: true },
                }),
                prisma.payrollProgress.findUnique({
                    where: { payrollRunId },
                    select: { totalEmployees: true, completedEmployees: true, failedEmployees: true },
                }),
            ]);

            const hasFailed = progress && progress.failedEmployees > 0;
            const candidateStatus = hasFailed ? "FAILED" : "COMPLETED";

            const context = progress
                ? {
                    totalEmployees: progress.totalEmployees,
                    processedEmployees: progress.completedEmployees ?? 0,
                    failedEmployees: progress.failedEmployees ?? 0,
                }
                : { totalEmployees: 0, processedEmployees: 0, failedEmployees: 0 };

            const transition = validateStatusTransition(
                currentRun?.status ?? "PROCESSING",
                candidateStatus,
                context
            );

            if (transition.valid) {
                finalStatus = candidateStatus;
            } else {
                logger.warn(`Payroll run ${payrollRunId} status transition rejected by state machine`, {
                    payrollRunId,
                    currentStatus: currentRun?.status,
                    candidateStatus,
                    message: transition.message,
                    context,
                });
                finalStatus = "FAILED";
            }
        }

        // Update payroll run
        const updateData = {
            totalEmployees: totals.totalEmployees,
            totalGrossPay: totals.totalGrossPay,
            totalAllowances: totals.totalAllowances,
            totalDeductions: totals.totalDeductions,
            totalNetPay: totals.totalNetPay,
            ...(finalStatus && { status: finalStatus }),
        };

        const updatedRun = await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: updateData,
            include: {
                payPeriod: true,
            },
        });

        logger.info(`Finalized payroll run ${payrollRunId}`, {
            payrollRunId,
            status: finalStatus || updatedRun.status,
            totalEmployees: totals.totalEmployees,
            totalGrossPay: totals.totalGrossPay,
            totalNetPay: totals.totalNetPay,
        });

        // Update pay period status if requested
        if (updatePayPeriod && updatedRun.payPeriod) {
            try {
                await updatePayPeriodStatusAutomatically(
                    updatedRun.payPeriod.id,
                    updatedRun.tenantId
                );
            } catch (autoError) {
                logger.warn(`Failed to auto-update pay period status: ${autoError.message}`);
            }
        }

        return updatedRun;
    } catch (error) {
        logger.error(`Error finalizing payroll run: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        throw error;
    }
};

/**
 * Create or update a payslip record from payroll calculation data
 * This is a shared function to ensure consistent payslip creation/update logic
 * @param {string} payrollRunId - Payroll run ID
 * @param {string} employeeId - Employee ID
 * @param {Object} payslipData - Payslip calculation data from processEmployeePayroll
 * @param {Object} options - Optional configuration
 * @param {boolean} options.includeUser - Include user data in response (default: false)
 * @returns {Promise<Object>} Created or updated payslip record
 */
export const createOrUpdatePayslip = async (payrollRunId, employeeId, payslipData, options = {}) => {
    try {
        const { includeUser = false } = options;

        // Check for existing payslip
        const existingPayslip = await prisma.payslip.findFirst({
            where: {
                payrollRunId,
                userId: employeeId,
            },
        });

        const payslipDataToSave = {
            grossSalary: payslipData.grossSalary,
            totalAllowances: payslipData.totalAllowances,
            totalDeductions: payslipData.totalDeductions,
            netSalary: payslipData.netSalary,
            hasWarnings: !!payslipData.warnings,
            warnings: payslipData.warnings || null,
            breakdownSnapshot: payslipData.breakdownSnapshot ?? null,
        };

        let payslip;
        const includeOptions = includeUser
            ? {
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                        },
                    },
                },
            }
            : {};

        if (existingPayslip) {
            // Update existing payslip
            payslip = await prisma.payslip.update({
                where: { id: existingPayslip.id },
                data: payslipDataToSave,
                ...includeOptions,
            });
        } else {
            // Create new payslip
            payslip = await prisma.payslip.create({
                data: {
                    payrollRunId,
                    userId: employeeId,
                    ...payslipDataToSave,
                },
                ...includeOptions,
            });
        }

        return payslip;
    } catch (error) {
        logger.error(`Error creating/updating payslip: ${error.message}`, {
            error: error.stack,
            payrollRunId,
            employeeId,
        });
        throw error;
    }
};

/**
 * Process payroll for a single employee and generate payslip
 * @param {string} employeeId - Employee ID
 * @param {string} payPeriodId - Pay period ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Payslip data
 */
export const processEmployeePayroll = async (employeeId, payPeriodId, tenantId) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                gambiaStatutoryEnabled: true,
                gambiaSsnFundingMode: true,
                employerSocialSecurityRate: true,
                gambiaTaxAgeExemptionEnabled: true,
                gambiaTaxExemptionAge: true,
                overtimeEnabled: true,
                overtimePayMultiplier: true,
            },
        });

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
                dateOfBirth: true,
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

        // Use monthly base for all calculations (convert annual to monthly once)
        const baseSalaryMonthly =
            salaryStructure.salaryPeriodType === "ANNUAL"
                ? salaryStructure.baseSalary / 12
                : salaryStructure.baseSalary;

        const otState = await getOvertimePayrollState(
            employeeId,
            tenantId,
            payPeriodId,
            payPeriod.startDate,
            payPeriod.endDate
        );
        if (otState.blocked) {
            throw new OvertimeNotApprovedError(
                `Employee has ${otState.rawHours.toFixed(2)} overtime hour(s) in this pay period. ` +
                    "An HR Admin must approve or reject overtime (Payroll → Overtime) before this employee can be included in payroll."
            );
        }
        const payableOvertimeHours = otState.payableHours;

        const formulaScopeOptions = {
            payPeriodStartDate: payPeriod.startDate,
            payPeriodEndDate: payPeriod.endDate,
        };

        const overtimeEnabled = tenant?.overtimeEnabled !== false;
        const multiplier =
            overtimeEnabled &&
            tenant?.overtimePayMultiplier != null &&
            Number(tenant.overtimePayMultiplier) > 0
                ? Number(tenant.overtimePayMultiplier)
                : 1.5;

        const supplementalAllowanceLines = [];
        let overtimeMeta = null;
        if (overtimeEnabled && payableOvertimeHours > 0) {
            const ot = await computeOvertimePayAmount(
                baseSalaryMonthly,
                tenantId,
                payPeriod.startDate,
                payPeriod.endDate,
                payableOvertimeHours,
                multiplier
            );
            supplementalAllowanceLines.push({
                name: "Overtime pay",
                amount: ot.amount,
                calculationMethod: "OVERTIME",
                description: ot.description,
            });
            overtimeMeta = {
                hours: ot.hours,
                hourlyRate: ot.hourlyRate,
                multiplier: ot.multiplier,
                amount: ot.amount,
            };
        }

        // Build employee context for conditional calculations
        const employeeContext = {
            departmentId: employee.departmentId,
            positionId: employee.positionId,
            employmentType: employee.employmentType,
            baseSalary: baseSalaryMonthly,
            status: employee.status,
            hireDate: employee.hireDate,
            dateOfBirth: employee.dateOfBirth,
            overtimeHours: payableOvertimeHours,
        };

        const getAgeFromDate = (date) => {
            if (!date) return null;
            const today = new Date();
            const dob = new Date(date);
            let age = today.getFullYear() - dob.getFullYear();
            const monthDiff = today.getMonth() - dob.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
                age--;
            }
            return age;
        };

        const employeeAge = getAgeFromDate(employee.dateOfBirth);
        const isGambiaTaxExempt =
            Boolean(tenant?.gambiaStatutoryEnabled) &&
            Boolean(tenant?.gambiaTaxAgeExemptionEnabled) &&
            tenant?.gambiaTaxExemptionAge != null &&
            employeeAge != null &&
            employeeAge >= tenant.gambiaTaxExemptionAge;

        // Snapshot itemized breakdown so later config changes don't change this payslip's detail/PDF
        const itemized = await getSalaryBreakdownItemized(
            baseSalaryMonthly,
            salaryStructure.allowances,
            salaryStructure.deductions,
            employeeContext,
            tenantId,
            tenant?.gambiaStatutoryEnabled ?? false,
            tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE",
            isGambiaTaxExempt,
            formulaScopeOptions,
            supplementalAllowanceLines
        );

        const grossSalary = itemized.grossSalary;
        const totalAllowances = itemized.allowanceLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const totalDeductions = itemized.totalDeductions;
        const netSalaryFinal = itemized.netSalary;

        const warnings = itemized.negativeNetWarning
            ? {
                  hasNegativeNetSalary: true,
                  originalNetSalary: itemized.originalNetSalary,
                  message: `Deductions exceed gross salary. Original net: ${itemized.originalNetSalary.toFixed(2)}, adjusted to 0.`,
              }
            : null;

        if (warnings?.hasNegativeNetSalary) {
            logger.warn(`Negative net salary detected for employee ${employeeId}: ${warnings.message}`, {
                employeeId,
                grossSalary,
                originalNetSalary: warnings.originalNetSalary,
                adjustedNetSalary: netSalaryFinal,
            });
        }
        const ssnFundingMode = tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE";
        const employerRatePercent = resolveEmployerSocialSecurityRatePercent(
            tenant?.employerSocialSecurityRate ?? null,
            tenant?.gambiaStatutoryEnabled ?? false
        );
        const employerContributions = tenant?.gambiaStatutoryEnabled
            ? buildGambiaEmployerContributionLines(grossSalary, ssnFundingMode, employerRatePercent ?? 0)
            : [];
        const employerSSHFCLine = employerContributions.find((l) => l.name === "Employer SSHFC") ?? null;
        const breakdownSnapshot = {
            baseSalary: baseSalaryMonthly,
            currency: salaryStructure.currency || "USD",
            allowances: itemized.allowanceLines.map((line) => ({
                name: line.name,
                amount: line.amount,
                calculationMethod: line.calculationMethod,
                description: line.description,
            })),
            deductions: itemized.deductionLines.map((line) => ({
                name: line.name,
                amount: line.amount,
                calculationMethod: line.calculationMethod,
                description: line.description,
            })),
            ...(tenant?.gambiaStatutoryEnabled && {
                gambiaSsnFundingMode: ssnFundingMode,
                employerContributions,
                ...(employerRatePercent != null &&
                    employerSSHFCLine?.amount != null && {
                        employerSSHFCRate: employerRatePercent,
                        employerSSHFCAmount: employerSSHFCLine.amount,
                    }),
            }),
            ...(overtimeMeta && { overtime: overtimeMeta }),
        };

        return {
            employeeId: employee.id,
            grossSalary,
            totalAllowances,
            totalDeductions,
            netSalary: netSalaryFinal,
            warnings: warnings?.hasNegativeNetSalary ? warnings : null,
            breakdownSnapshot,
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

// NOTE: Sequential payroll processing has been removed.
// All payroll processing now uses BullMQ queue-based processing for better scalability and reliability.

/**
 * Queue a payroll run for async processing via BullMQ
 * BullMQ is now required - Redis must be configured
 * @param {string} payrollRunId - Payroll run ID
 * @param {string} tenantId - Tenant ID
 * @param {string} payPeriodId - Pay period ID
 * @param {Array<string>} employeeIds - Array of employee IDs
 * @param {string} processedBy - User ID who started the run
 * @returns {Promise<Object>} Queue job info
 */
export const queuePayrollRun = async (payrollRunId, tenantId, payPeriodId, employeeIds, processedBy) => {
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

