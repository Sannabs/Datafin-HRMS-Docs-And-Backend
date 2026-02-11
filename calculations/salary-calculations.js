import { evaluateFormula } from "../services/formula-evaluator.service.js";
import logger from "../utils/logger.js";

/**
 * Calculate the amount for a single allowance based on calculation method
 * @param {Object} allowance - Allowance object with amount, calculationMethod, allowanceTypeId
 * @param {number} baseSalary - Employee's base salary
 * @param {Object} [employeeContext] - Optional employee context for conditional calculations
 * @param {number} [grossSalary] - Optional gross salary (for percentage-based conditional calculations)
 * @param {string} [tenantId] - Optional tenant ID for rule lookup
 * @returns {Promise<number>|number} Calculated allowance amount
 */
export const calculateAllowanceAmount = async (
    allowance,
    baseSalary,
    employeeContext = null,
    grossSalary = 0,
    tenantId = null
) => {
    const { amount, calculationMethod, allowanceTypeId, formulaExpression } = allowance;

    switch (calculationMethod) {
        case "FIXED":
            return amount;

        case "PERCENTAGE":
            // Amount represents percentage (e.g., 20 means 20% of base salary)
            return (baseSalary * amount) / 100;

        case "FORMULA":
            if (!formulaExpression || typeof formulaExpression !== "string") {
                logger.warn("FORMULA allowance missing formulaExpression", { allowanceId: allowance.id });
                return 0;
            }
            try {
                const result = await evaluateFormula(
                    formulaExpression,
                    baseSalary,
                    grossSalary || baseSalary,
                    employeeContext || {},
                    {},
                    tenantId
                );
                if (result.success && typeof result.result === "number") {
                    return result.result;
                }
                logger.warn("Formula allowance evaluation failed", {
                    allowanceId: allowance.id,
                    error: result.error,
                });
                return 0;
            } catch (error) {
                logger.error(`Error evaluating allowance formula: ${error.message}`, {
                    allowanceId: allowance.id,
                    error: error.stack,
                });
                return 0;
            }

        default:
            return 0;
    }
};

/**
 * Calculate the amount for a single deduction based on calculation method
 * @param {Object} deduction - Deduction object with amount, calculationMethod, deductionTypeId
 * @param {number} grossSalary - Employee's gross salary
 * @param {number} baseSalary - Employee's base salary
 * @param {Object} [employeeContext] - Optional employee context for conditional calculations
 * @param {string} [tenantId] - Optional tenant ID for rule lookup
 * @returns {Promise<number>|number} Calculated deduction amount
 */
export const calculateDeductionAmount = async (
    deduction,
    grossSalary,
    baseSalary,
    employeeContext = null,
    tenantId = null
) => {
    const { amount, calculationMethod, deductionTypeId, formulaExpression } = deduction;

    switch (calculationMethod) {
        case "FIXED":
            return amount;

        case "PERCENTAGE":
            // Amount represents percentage (e.g., 15 means 15% of gross salary)
            return (grossSalary * amount) / 100;

        case "FORMULA":
            if (!formulaExpression || typeof formulaExpression !== "string") {
                logger.warn("FORMULA deduction missing formulaExpression", { deductionId: deduction.id });
                return 0;
            }
            try {
                const result = await evaluateFormula(
                    formulaExpression,
                    baseSalary,
                    grossSalary,
                    employeeContext || {},
                    {},
                    tenantId
                );
                if (result.success && typeof result.result === "number") {
                    return result.result;
                }
                logger.warn("Formula deduction evaluation failed", {
                    deductionId: deduction.id,
                    error: result.error,
                });
                return 0;
            } catch (error) {
                logger.error(`Error evaluating deduction formula: ${error.message}`, {
                    deductionId: deduction.id,
                    error: error.stack,
                });
                return 0;
            }

        default:
            return 0;
    }
};

/**
 * Calculate gross salary from base salary and allowances
 * @param {number} baseSalary - Employee's base salary
 * @param {Array} allowances - Array of allowance objects
 * @param {Object} [employeeContext] - Optional employee context for conditional calculations
 * @param {string} [tenantId] - Optional tenant ID for rule lookup
 * @returns {Promise<number>|number} Calculated gross salary
 */
export const calculateGrossSalary = async (
    baseSalary,
    allowances = [],
    employeeContext = null,
    tenantId = null
) => {
    if (!allowances || allowances.length === 0) {
        return baseSalary;
    }

    let totalAllowances = 0;
    let currentGross = baseSalary; // Track gross for conditional calculations

    for (const allowance of allowances) {
        // For conditional allowances that might depend on grossSalary, we use current gross
        // This allows percentage-based conditional allowances to work correctly
        const allowanceAmount = await calculateAllowanceAmount(
            allowance,
            baseSalary,
            employeeContext,
            currentGross,
            tenantId
        );
        totalAllowances += allowanceAmount;
        // Update current gross for next iteration (if conditional depends on gross)
        currentGross = baseSalary + totalAllowances;
    }

    return baseSalary + totalAllowances;
};

/**
 * Calculate net salary from gross salary and deductions
 * @param {number} grossSalary - Employee's gross salary
 * @param {Array} deductions - Array of deduction objects
 * @param {number} baseSalary - Employee's base salary
 * @param {Object} [employeeContext] - Optional employee context for conditional calculations
 * @param {string} [tenantId] - Optional tenant ID for rule lookup
 * @returns {Promise<Object>} Object containing netSalary, totalDeductions, and warning flags
 */
export const calculateNetSalary = async (
    grossSalary,
    deductions = [],
    baseSalary = 0,
    employeeContext = null,
    tenantId = null
) => {
    if (!deductions || deductions.length === 0) {
        return {
            netSalary: grossSalary,
            totalDeductions: 0,
            hasNegativeNetWarning: false,
            originalNetSalary: grossSalary,
        };
    }

    let totalDeductions = 0;

    for (const deduction of deductions) {
        const deductionAmount = await calculateDeductionAmount(
            deduction,
            grossSalary,
            baseSalary,
            employeeContext,
            tenantId
        );
        totalDeductions += deductionAmount;
    }

    const originalNetSalary = grossSalary - totalDeductions;
    const hasNegativeNetWarning = originalNetSalary < 0;

    // Business rule: Net salary cannot be negative
    // If deductions exceed gross, return 0 but flag for review
    return {
        netSalary: Math.max(0, originalNetSalary),
        totalDeductions,
        hasNegativeNetWarning,
        originalNetSalary, // The actual calculated value (can be negative)
    };
};

/**
 * Main function to call when allowances/deductions change
 * @param {number} baseSalary - Employee's base salary
 * @param {Array} allowances - Array of allowance objects
 * @param {Array} deductions - Array of deduction objects
 * @param {Object} [employeeContext] - Optional employee context for conditional calculations
 * @param {string} [tenantId] - Optional tenant ID for rule lookup
 * @returns {Promise<Object>} Object containing grossSalary, netSalary, and warnings
 */
export const recalculateSalary = async (
    baseSalary,
    allowances = [],
    deductions = [],
    employeeContext = null,
    tenantId = null
) => {
    const grossSalary = await calculateGrossSalary(baseSalary, allowances, employeeContext, tenantId);
    const netResult = await calculateNetSalary(grossSalary, deductions, baseSalary, employeeContext, tenantId);

    return {
        grossSalary,
        netSalary: netResult.netSalary,
        totalDeductions: netResult.totalDeductions,
        warnings: {
            hasNegativeNetSalary: netResult.hasNegativeNetWarning,
            originalNetSalary: netResult.originalNetSalary,
            message: netResult.hasNegativeNetWarning
                ? `Deductions exceed gross salary. Original net: ${netResult.originalNetSalary.toFixed(2)}, adjusted to 0.`
                : null,
        },
    };
};
