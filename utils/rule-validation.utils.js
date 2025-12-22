import { validateFormula } from "../services/formula-evaluator.service.js";

// All supported operators (including new json-rules-engine operators)
const VALID_OPERATORS = [
    // Basic comparison
    "equals",
    "notEquals",
    "greaterThan",
    "lessThan",
    "greaterThanOrEqual",
    "lessThanOrEqual",
    "between",
    "notBetween",
    // Array operators
    "in",
    "notIn",
    "arrayContains",
    "arrayLength",
    // String operators
    "contains",
    "startsWith",
    "endsWith",
    "matches",
    "isEmpty",
    // Date operators
    "dateBefore",
    "dateAfter",
    "dateEquals",
];

/**
 * Validates calculation rule conditions structure
 * @param {Object} conditions - Condition object or condition tree
 * @returns {Object} Validation result with valid (boolean) and error (string) properties
 */
export const validateConditions = (conditions) => {
    if (!conditions || typeof conditions !== "object") {
        return { valid: false, error: "Conditions must be an object" };
    }

    // If it's a single condition
    if (conditions.field && conditions.operator && conditions.value !== undefined) {
        if (!VALID_OPERATORS.includes(conditions.operator)) {
            return { valid: false, error: `Invalid operator: ${conditions.operator}` };
        }
        return { valid: true };
    }

    // If it's a condition tree
    if (conditions.operator && conditions.conditions) {
        if (!["AND", "OR"].includes(conditions.operator)) {
            return { valid: false, error: "Condition tree operator must be AND or OR" };
        }
        if (!Array.isArray(conditions.conditions) || conditions.conditions.length === 0) {
            return { valid: false, error: "Conditions array must not be empty" };
        }

        // Recursively validate each condition
        for (const condition of conditions.conditions) {
            const result = validateConditions(condition);
            if (!result.valid) {
                return result;
            }
        }
        return { valid: true };
    }

    return { valid: false, error: "Invalid conditions structure" };
};

/**
 * Validates calculation rule action structure
 * @param {Object} action - Action object with type, value, and optional base
 * @returns {Object} Validation result with valid (boolean) and error (string) properties
 */
export const validateAction = (action) => {
    if (!action || typeof action !== "object") {
        return { valid: false, error: "Action must be an object" };
    }

    const { type, value, base } = action;

    if (!type || !["FIXED", "PERCENTAGE", "FORMULA"].includes(type)) {
        return { valid: false, error: "Action type must be FIXED, PERCENTAGE, or FORMULA" };
    }

    if (value === undefined || value === null) {
        return { valid: false, error: "Action value is required" };
    }

    // Type-specific validation
    switch (type) {
        case "FIXED":
            // Value must be a number
            if (isNaN(Number(value))) {
                return { valid: false, error: "FIXED action value must be a number" };
            }
            break;

        case "PERCENTAGE":
            // Value must be a number (the percentage)
            if (isNaN(Number(value))) {
                return { valid: false, error: "PERCENTAGE action value must be a number" };
            }
            // Base must be valid if provided
            if (base && !["baseSalary", "grossSalary"].includes(base)) {
                return { valid: false, error: "Action base must be baseSalary or grossSalary for PERCENTAGE type" };
            }
            break;

        case "FORMULA":
            // Value must be a string containing the formula
            if (typeof value !== "string") {
                return { valid: false, error: "FORMULA action value must be a string" };
            }
            // Validate the formula syntax
            const formulaValidation = validateFormula(value);
            if (!formulaValidation.valid) {
                return { valid: false, error: `Invalid formula: ${formulaValidation.error}` };
            }
            break;
    }

    return { valid: true };
};

