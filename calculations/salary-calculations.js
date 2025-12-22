import { getConditionalAmount } from "../services/rule-engine.service.js";
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
    const { amount, calculationMethod, allowanceTypeId } = allowance;

    switch (calculationMethod) {
        case "FIXED":
            return amount;

        case "PERCENTAGE":
            // Amount represents percentage (e.g., 20 means 20% of base salary)
            return (baseSalary * amount) / 100;

        case "CONDITIONAL":
            // Use rule engine to calculate conditional amount
            if (employeeContext && tenantId && allowanceTypeId) {
                try {
                    const conditionalAmount = await getConditionalAmount(
                        "ALLOWANCE",
                        allowanceTypeId,
                        employeeContext,
                        baseSalary,
                        grossSalary || baseSalary, // Use grossSalary if available, otherwise baseSalary
                        tenantId
                    );
                    // If rule engine returns 0 (no matching rules), fallback to stored amount
                    return conditionalAmount > 0 ? conditionalAmount : amount;
                } catch (error) {
                    logger.error(`Error calculating conditional allowance: ${error.message}`, {
                        error: error.stack,
                        allowanceTypeId,
                    });
                    // Fallback to stored amount on error
                    return amount;
                }
            }
            // If no context provided, return stored amount (backward compatibility)
            return amount;

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
    const { amount, calculationMethod, deductionTypeId } = deduction;

    switch (calculationMethod) {
        case "FIXED":
            return amount;

        case "PERCENTAGE":
            // Amount represents percentage (e.g., 15 means 15% of gross salary)
            return (grossSalary * amount) / 100;

        case "CONDITIONAL":
            // Use rule engine to calculate conditional amount
            if (employeeContext && tenantId && deductionTypeId) {
                try {
                    const conditionalAmount = await getConditionalAmount(
                        "DEDUCTION",
                        deductionTypeId,
                        employeeContext,
                        baseSalary,
                        grossSalary,
                        tenantId
                    );
                    // If rule engine returns 0 (no matching rules), fallback to stored amount
                    return conditionalAmount > 0 ? conditionalAmount : amount;
                } catch (error) {
                    logger.error(`Error calculating conditional deduction: ${error.message}`, {
                        error: error.stack,
                        deductionTypeId,
                    });
                    // Fallback to stored amount on error
                    return amount;
                }
            }
            // If no context provided, return stored amount (backward compatibility)
            return amount;

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
 * @returns {Promise<number>|number} Calculated net salary
 */
export const calculateNetSalary = async (
    grossSalary,
    deductions = [],
    baseSalary = 0,
    employeeContext = null,
    tenantId = null
) => {
    if (!deductions || deductions.length === 0) {
        return grossSalary;
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

    const netSalary = grossSalary - totalDeductions;

    // Business rule: Net salary cannot be negative
    // If deductions exceed gross, return 0 (may need manual review in production)
    return Math.max(0, netSalary);
};

/**
 * Main function to call when allowances/deductions change
 * @param {number} baseSalary - Employee's base salary
 * @param {Array} allowances - Array of allowance objects
 * @param {Array} deductions - Array of deduction objects
 * @param {Object} [employeeContext] - Optional employee context for conditional calculations
 * @param {string} [tenantId] - Optional tenant ID for rule lookup
 * @returns {Promise<Object>} Object containing grossSalary and netSalary
 */
export const recalculateSalary = async (
    baseSalary,
    allowances = [],
    deductions = [],
    employeeContext = null,
    tenantId = null
) => {
    const grossSalary = await calculateGrossSalary(baseSalary, allowances, employeeContext, tenantId);
    const netSalary = await calculateNetSalary(grossSalary, deductions, baseSalary, employeeContext, tenantId);

    return {
        grossSalary,
        netSalary,
    };
};
