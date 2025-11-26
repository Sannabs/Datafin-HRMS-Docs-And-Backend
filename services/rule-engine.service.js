import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

/**
 * Evaluate a single condition against employee context
 * @param {Object} condition - Condition object with field, operator, and value
 * @param {Object} employeeContext - Employee context data
 * @returns {boolean} True if condition matches
 */
const evaluateCondition = (condition, employeeContext) => {
    const { field, operator, value } = condition;
    const employeeValue = employeeContext[field];

    if (employeeValue === undefined || employeeValue === null) {
        return false;
    }

    switch (operator) {
        case "equals":
            return employeeValue === value;

        case "notEquals":
            return employeeValue !== value;

        case "in":
            return Array.isArray(value) && value.includes(employeeValue);

        case "notIn":
            return Array.isArray(value) && !value.includes(employeeValue);

        case "greaterThan":
            return Number(employeeValue) > Number(value);

        case "lessThan":
            return Number(employeeValue) < Number(value);

        case "greaterThanOrEqual":
            return Number(employeeValue) >= Number(value);

        case "lessThanOrEqual":
            return Number(employeeValue) <= Number(value);

        case "contains":
            return String(employeeValue).toLowerCase().includes(String(value).toLowerCase());

        default:
            logger.warn(`Unknown condition operator: ${operator}`);
            return false;
    }
};

/**
 * Recursively evaluate condition tree
 * @param {Object} conditions - Condition tree with operator and conditions array
 * @param {Object} employeeContext - Employee context data
 * @returns {boolean} True if all conditions match
 */
export const evaluateConditions = (conditions, employeeContext) => {
    if (!conditions || typeof conditions !== "object") {
        return false;
    }

    // If it's a single condition (not a tree)
    if (conditions.field && conditions.operator && conditions.value !== undefined) {
        return evaluateCondition(conditions, employeeContext);
    }

    // If it's a condition tree with operator and conditions array
    const { operator, conditions: conditionArray } = conditions;

    if (!operator || !Array.isArray(conditionArray) || conditionArray.length === 0) {
        return false;
    }

    const results = conditionArray.map((condition) => {
        return evaluateConditions(condition, employeeContext);
    });

    if (operator === "AND") {
        return results.every((result) => result === true);
    } else if (operator === "OR") {
        return results.some((result) => result === true);
    }

    return false;
};

/**
 * Check if a rule matches the employee context
 * @param {Object} rule - CalculationRule object from database
 * @param {Object} employeeContext - Employee context data
 * @returns {boolean} True if rule matches
 */
export const evaluateRule = (rule, employeeContext) => {
    if (!rule.isActive) {
        return false;
    }

    // Check rule validity period
    const today = new Date();
    if (rule.effectiveDate > today) {
        return false;
    }

    if (rule.endDate && rule.endDate < today) {
        return false;
    }

    // Evaluate conditions
    if (!rule.conditions) {
        return false;
    }

    return evaluateConditions(rule.conditions, employeeContext);
};

/**
 * Calculate amount based on rule action
 * @param {Object} rule - CalculationRule object
 * @param {Object} employeeContext - Employee context data
 * @param {number} baseSalary - Employee's base salary
 * @param {number} grossSalary - Employee's gross salary
 * @returns {number} Calculated amount
 */
export const calculateRuleAmount = (rule, employeeContext, baseSalary, grossSalary) => {
    if (!rule.action || typeof rule.action !== "object") {
        logger.warn(`Rule ${rule.id} has invalid action`);
        return 0;
    }

    const { type, value, base } = rule.action;

    if (value === undefined || value === null) {
        return 0;
    }

    switch (type) {
        case "FIXED":
            return Number(value);

        case "PERCENTAGE":
            const baseAmount = base === "grossSalary" ? grossSalary : baseSalary;
            return (baseAmount * Number(value)) / 100;

        case "FORMULA":
            // For now, FORMULA is not implemented
            // Future: Could implement a formula evaluator
            logger.warn(`FORMULA action type not yet implemented for rule ${rule.id}`);
            return Number(value) || 0;

        default:
            logger.warn(`Unknown action type: ${type} for rule ${rule.id}`);
            return 0;
    }
};

/**
 * Find all matching rules for a given rule type and employee context
 * @param {string} ruleType - "ALLOWANCE" or "DEDUCTION"
 * @param {string} typeId - AllowanceType ID or DeductionType ID
 * @param {Object} employeeContext - Employee context data
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of matching rules sorted by priority
 */
export const findMatchingRules = async (ruleType, typeId, employeeContext, tenantId) => {
    try {
        const today = new Date();

        // Build query based on rule type
        const where = {
            tenantId,
            ruleType,
            isActive: true,
            deletedAt: null,
            effectiveDate: { lte: today },
            OR: [{ endDate: null }, { endDate: { gte: today } }],
        };

        if (ruleType === "ALLOWANCE") {
            where.allowanceTypeId = typeId;
        } else if (ruleType === "DEDUCTION") {
            where.deductionTypeId = typeId;
        }

        const rules = await prisma.calculationRule.findMany({
            where,
            orderBy: {
                priority: "desc", // Higher priority first
            },
        });

        // Filter rules that match employee context
        const matchingRules = rules.filter((rule) => evaluateRule(rule, employeeContext));

        return matchingRules;
    } catch (error) {
        logger.error(`Error finding matching rules: ${error.message}`, {
            error: error.stack,
            ruleType,
            typeId,
            tenantId,
        });
        return [];
    }
};

/**
 * Get conditional amount for an allowance or deduction
 * Main entry point for conditional calculations
 * @param {string} ruleType - "ALLOWANCE" or "DEDUCTION"
 * @param {string} typeId - AllowanceType ID or DeductionType ID
 * @param {Object} employeeContext - Employee context data
 * @param {number} baseSalary - Employee's base salary
 * @param {number} grossSalary - Employee's gross salary
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Calculated amount (0 if no matching rules)
 */
export const getConditionalAmount = async (
    ruleType,
    typeId,
    employeeContext,
    baseSalary,
    grossSalary,
    tenantId
) => {
    try {
        const matchingRules = await findMatchingRules(ruleType, typeId, employeeContext, tenantId);

        if (matchingRules.length === 0) {
            return 0;
        }

        // Use the highest priority matching rule (first in array since sorted by priority desc)
        const rule = matchingRules[0];

        const amount = calculateRuleAmount(rule, employeeContext, baseSalary, grossSalary);

        logger.info(`Conditional calculation applied: Rule ${rule.id} for ${ruleType} ${typeId}`, {
            ruleId: rule.id,
            ruleName: rule.name,
            amount,
        });

        return amount;
    } catch (error) {
        logger.error(`Error calculating conditional amount: ${error.message}`, {
            error: error.stack,
            ruleType,
            typeId,
            tenantId,
        });
        return 0;
    }
};

