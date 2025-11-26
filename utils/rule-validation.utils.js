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
        const validOperators = [
            "equals",
            "notEquals",
            "in",
            "notIn",
            "greaterThan",
            "lessThan",
            "greaterThanOrEqual",
            "lessThanOrEqual",
            "contains",
        ];
        if (!validOperators.includes(conditions.operator)) {
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

    if (type === "PERCENTAGE" && base && !["baseSalary", "grossSalary"].includes(base)) {
        return { valid: false, error: "Action base must be baseSalary or grossSalary for PERCENTAGE type" };
    }

    return { valid: true };
};

