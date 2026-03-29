import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import {
    processEmployeePayroll,
    getActiveEmployeesForPayroll,
} from "./payroll-run.service.js";
import { getOvertimePayrollState } from "../utils/overtime-payroll.util.js";

/**
 * Validate employee eligibility for payroll processing
 * @param {Array<string>} employeeIds - Array of employee IDs
 * @param {string} tenantId - Tenant ID
 * @param {string} payPeriodId - Pay period ID
 * @returns {Promise<Object>} Validation results
 */
export const validateEmployees = async (employeeIds, tenantId, payPeriodId) => {
    try {
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
                tenantId,
            },
        });

        if (!payPeriod) {
            throw new Error(`Pay period ${payPeriodId} not found`);
        }

        const employees = await prisma.user.findMany({
            where: {
                id: { in: employeeIds },
                tenantId,
            },
            select: {
                id: true,
                name: true,
                employeeId: true,
                status: true,
                isDeleted: true,
            },
        });

        const warnings = [];
        const eligible = [];
        const ineligible = [];

        for (const employee of employees) {
            if (employee.isDeleted || employee.status !== "ACTIVE") {
                ineligible.push({
                    employeeId: employee.id,
                    name: employee.name,
                    reason: employee.isDeleted ? "Employee is deleted" : `Employee status: ${employee.status}`,
                });
                continue;
            }

            // Check for active salary structure
            const salaryStructure = await prisma.salaryStructure.findFirst({
                where: {
                    userId: employee.id,
                    tenantId,
                    effectiveDate: { lte: payPeriod.endDate },
                    OR: [
                        { endDate: null },
                        { endDate: { gte: payPeriod.startDate } },
                    ],
                },
            });

            if (!salaryStructure) {
                warnings.push({
                    employeeId: employee.id,
                    name: employee.name,
                    warning: "No active salary structure found",
                });
                ineligible.push({
                    employeeId: employee.id,
                    name: employee.name,
                    reason: "No active salary structure",
                });
            } else {
                const otState = await getOvertimePayrollState(
                    employee.id,
                    tenantId,
                    payPeriodId,
                    payPeriod.startDate,
                    payPeriod.endDate
                );
                if (otState.blocked) {
                    warnings.push({
                        employeeId: employee.id,
                        name: employee.name,
                        warning: `Overtime recorded (${otState.rawHours.toFixed(2)}h) but not approved by HR`,
                    });
                    ineligible.push({
                        employeeId: employee.id,
                        name: employee.name,
                        reason: "Overtime requires HR approval (Payroll → Overtime)",
                    });
                } else {
                    eligible.push({
                        employeeId: employee.id,
                        name: employee.name,
                        employeeCode: employee.employeeId,
                    });
                }
            }
        }

        return {
            eligible,
            ineligible,
            warnings,
        };
    } catch (error) {
        logger.error(`Error validating employees: ${error.message}`, {
            error: error.stack,
            tenantId,
            payPeriodId,
        });
        throw error;
    }
};

/**
 * Calculate estimated totals for employees
 * @param {Array<string>} employeeIds - Array of employee IDs
 * @param {string} tenantId - Tenant ID
 * @param {string} payPeriodId - Pay period ID
 * @returns {Promise<Object>} Estimated totals
 */
export const calculateEstimatedTotals = async (employeeIds, tenantId, payPeriodId) => {
    try {
        let totalGrossPay = 0;
        let totalDeductions = 0;
        let totalNetPay = 0;
        const employeeEstimates = [];

        for (const employeeId of employeeIds) {
            try {
                const payslipData = await processEmployeePayroll(employeeId, payPeriodId, tenantId);
                totalGrossPay += payslipData.grossSalary;
                totalDeductions += payslipData.totalDeductions;
                totalNetPay += payslipData.netSalary;

                employeeEstimates.push({
                    employeeId,
                    grossSalary: payslipData.grossSalary,
                    totalDeductions: payslipData.totalDeductions,
                    netSalary: payslipData.netSalary,
                });
            } catch (error) {
                logger.warn(`Failed to calculate estimate for employee ${employeeId}: ${error.message}`);
                employeeEstimates.push({
                    employeeId,
                    error: error.message,
                });
            }
        }

        return {
            totalGrossPay,
            totalDeductions,
            totalNetPay,
            employeeCount: employeeEstimates.length,
            employeeEstimates,
        };
    } catch (error) {
        logger.error(`Error calculating estimated totals: ${error.message}`, {
            error: error.stack,
            tenantId,
            payPeriodId,
        });
        throw error;
    }
};

/**
 * Generate preview data for payroll run
 * @param {string} payPeriodId - Pay period ID
 * @param {Array<string>} employeeIds - Array of employee IDs (optional, if not provided, get all active)
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Preview data
 */
export const generatePreview = async (payPeriodId, employeeIds, tenantId) => {
    try {
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
                tenantId,
            },
        });

        if (!payPeriod) {
            throw new Error(`Pay period ${payPeriodId} not found`);
        }

        // Get employees to process using shared function
        const employeeIdsToProcess = await getActiveEmployeesForPayroll(
            tenantId,
            employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0 ? employeeIds : null
        );

        if (employeeIdsToProcess.length === 0) {
            return {
                payPeriod: {
                    id: payPeriod.id,
                    periodName: payPeriod.periodName,
                    startDate: payPeriod.startDate,
                    endDate: payPeriod.endDate,
                },
                employeeCount: 0,
                eligibleCount: 0,
                estimatedTotals: {
                    totalGrossPay: 0,
                    totalDeductions: 0,
                    totalNetPay: 0,
                },
                validation: {
                    eligible: [],
                    ineligible: [],
                    warnings: [],
                },
                message: "No eligible employees found",
            };
        }

        // Validate employees
        const validation = await validateEmployees(employeeIdsToProcess, tenantId, payPeriodId);

        // Calculate estimated totals for eligible employees
        const eligibleIds = validation.eligible.map((e) => e.employeeId);
        const estimatedTotals =
            eligibleIds.length > 0
                ? await calculateEstimatedTotals(eligibleIds, tenantId, payPeriodId)
                : {
                    totalGrossPay: 0,
                    totalDeductions: 0,
                    totalNetPay: 0,
                    employeeCount: 0,
                    employeeEstimates: [],
                };

        return {
            payPeriod: {
                id: payPeriod.id,
                periodName: payPeriod.periodName,
                startDate: payPeriod.startDate,
                endDate: payPeriod.endDate,
            },
            employeeCount: employeeIdsToProcess.length,
            eligibleCount: validation.eligible.length,
            ineligibleCount: validation.ineligible.length,
            estimatedTotals: {
                totalGrossPay: estimatedTotals.totalGrossPay,
                totalDeductions: estimatedTotals.totalDeductions,
                totalNetPay: estimatedTotals.totalNetPay,
                employeeCount: estimatedTotals.employeeCount,
            },
            validation,
            employeeEstimates: estimatedTotals.employeeEstimates,
        };
    } catch (error) {
        logger.error(`Error generating preview: ${error.message}`, {
            error: error.stack,
            payPeriodId,
            tenantId,
        });
        throw error;
    }
};

