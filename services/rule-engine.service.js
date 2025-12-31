import { Engine } from "json-rules-engine";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { evaluateFormula } from "./formula-evaluator.service.js";

// Cache for compiled engines per tenant
const engineCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear cache entry for a specific tenant
 * Should be called when rules are updated
 * @param {string} tenantId - Tenant ID to clear cache for
 */
export const clearRuleCache = (tenantId) => {
    const keys = [...engineCache.keys()].filter((key) => key.startsWith(tenantId));
    keys.forEach((key) => engineCache.delete(key));
    logger.info(`Rule cache cleared for tenant: ${tenantId}`);
};

/**
 * Map internal operator to json-rules-engine operator
 * @param {string} operator - Internal operator name
 * @returns {string} json-rules-engine operator
 */
const mapOperator = (operator) => {
    const operatorMap = {
        equals: "equal",
        notEquals: "notEqual",
        greaterThan: "greaterThan",
        lessThan: "lessThan",
        greaterThanOrEqual: "greaterThanOrEqual",
        lessThanOrEqual: "lessThanOrEqual",
        in: "in",
        notIn: "notIn",
        contains: "contains",
        startsWith: "startsWith",
        endsWith: "endsWith",
        dateBefore: "dateBefore",
        dateAfter: "dateAfter",
        dateEquals: "dateEquals",
        arrayContains: "arrayContains",
        arrayLength: "arrayLength",
    };
    return operatorMap[operator] || operator;
};

/**
 * Convert internal condition format to json-rules-engine condition
 * @param {Object} condition - Internal condition object
 * @returns {Object} json-rules-engine condition
 */
const convertCondition = (condition) => {
    const { field, operator, value } = condition;

    return {
        fact: field,
        operator: mapOperator(operator),
        value: value,
    };
};

/**
 * Recursively convert condition tree to json-rules-engine format
 * @param {Object} conditions - Internal conditions object (single or tree)
 * @returns {Object} json-rules-engine conditions object
 */
const convertConditions = (conditions) => {
    if (!conditions || typeof conditions !== "object") {
        return { all: [] };
    }

    // Single condition
    if (conditions.field && conditions.operator && conditions.value !== undefined) {
        return { all: [convertCondition(conditions)] };
    }

    // Condition tree
    const { operator, conditions: conditionArray } = conditions;

    if (!operator || !Array.isArray(conditionArray)) {
        return { all: [] };
    }

    const convertedConditions = conditionArray.map((cond) => {
        // Nested tree
        if (cond.operator && cond.conditions) {
            return convertConditions(cond);
        }
        // Single condition
        return convertCondition(cond);
    });

    // Map AND/OR to all/any
    if (operator === "AND") {
        return { all: convertedConditions };
    } else if (operator === "OR") {
        return { any: convertedConditions };
    }

    return { all: convertedConditions };
};

/**
 * Convert internal rule to json-rules-engine rule format
 * @param {Object} rule - Internal CalculationRule object
 * @returns {Object} json-rules-engine rule
 */
const convertRule = (rule) => {
    const conditions = convertConditions(rule.conditions);

    return {
        name: rule.name,
        conditions,
        event: {
            type: "rule-matched",
            params: {
                ruleId: rule.id,
                ruleName: rule.name,
                priority: rule.priority,
                action: rule.action,
            },
        },
        priority: rule.priority || 1,
    };
};

/**
 * Add custom operators to the engine
 * @param {Engine} engine - json-rules-engine instance
 */
const addCustomOperators = (engine) => {
    // String contains (case-insensitive)
    engine.addOperator("contains", (factValue, jsonValue) => {
        if (factValue === null || factValue === undefined) return false;
        return String(factValue).toLowerCase().includes(String(jsonValue).toLowerCase());
    });

    // String starts with
    engine.addOperator("startsWith", (factValue, jsonValue) => {
        if (factValue === null || factValue === undefined) return false;
        return String(factValue).toLowerCase().startsWith(String(jsonValue).toLowerCase());
    });

    // String ends with
    engine.addOperator("endsWith", (factValue, jsonValue) => {
        if (factValue === null || factValue === undefined) return false;
        return String(factValue).toLowerCase().endsWith(String(jsonValue).toLowerCase());
    });

    // Date before
    engine.addOperator("dateBefore", (factValue, jsonValue) => {
        if (!factValue || !jsonValue) return false;
        return new Date(factValue) < new Date(jsonValue);
    });

    // Date after
    engine.addOperator("dateAfter", (factValue, jsonValue) => {
        if (!factValue || !jsonValue) return false;
        return new Date(factValue) > new Date(jsonValue);
    });

    // Date equals (same day)
    engine.addOperator("dateEquals", (factValue, jsonValue) => {
        if (!factValue || !jsonValue) return false;
        const fact = new Date(factValue);
        const target = new Date(jsonValue);
        return (
            fact.getFullYear() === target.getFullYear() &&
            fact.getMonth() === target.getMonth() &&
            fact.getDate() === target.getDate()
        );
    });

    // Array contains element
    engine.addOperator("arrayContains", (factValue, jsonValue) => {
        if (!Array.isArray(factValue)) return false;
        return factValue.includes(jsonValue);
    });

    // Array length comparison
    engine.addOperator("arrayLength", (factValue, jsonValue) => {
        if (!Array.isArray(factValue)) return false;
        // jsonValue can be a number for exact match or object for comparison
        if (typeof jsonValue === "number") {
            return factValue.length === jsonValue;
        }
        if (typeof jsonValue === "object" && jsonValue !== null) {
            const { operator, value } = jsonValue;
            switch (operator) {
                case "greaterThan":
                    return factValue.length > value;
                case "lessThan":
                    return factValue.length < value;
                case "greaterThanOrEqual":
                    return factValue.length >= value;
                case "lessThanOrEqual":
                    return factValue.length <= value;
                default:
                    return factValue.length === value;
            }
        }
        return false;
    });

    // Between (inclusive)
    engine.addOperator("between", (factValue, jsonValue) => {
        if (factValue === null || factValue === undefined) return false;
        if (!jsonValue || typeof jsonValue !== "object") return false;
        const { min, max } = jsonValue;
        const numValue = Number(factValue);
        return numValue >= min && numValue <= max;
    });

    // Not between
    engine.addOperator("notBetween", (factValue, jsonValue) => {
        if (factValue === null || factValue === undefined) return false;
        if (!jsonValue || typeof jsonValue !== "object") return false;
        const { min, max } = jsonValue;
        const numValue = Number(factValue);
        return numValue < min || numValue > max;
    });

    // Matches regex
    engine.addOperator("matches", (factValue, jsonValue) => {
        if (factValue === null || factValue === undefined) return false;
        try {
            const regex = new RegExp(jsonValue, "i");
            return regex.test(String(factValue));
        } catch {
            return false;
        }
    });

    // Is empty (works for strings, arrays, objects)
    engine.addOperator("isEmpty", (factValue, jsonValue) => {
        if (factValue === null || factValue === undefined) return jsonValue === true;
        if (typeof factValue === "string") return factValue.length === 0 === jsonValue;
        if (Array.isArray(factValue)) return factValue.length === 0 === jsonValue;
        if (typeof factValue === "object") return Object.keys(factValue).length === 0 === jsonValue;
        return false;
    });
};

/**
 * Create and configure a new engine instance
 * @returns {Engine} Configured json-rules-engine instance
 */
const createEngine = () => {
    const engine = new Engine([], { allowUndefinedFacts: true });
    addCustomOperators(engine);
    return engine;
};

/**
 * Get or create cached engine for a tenant and rule type
 * @param {string} tenantId - Tenant ID
 * @param {string} ruleType - "ALLOWANCE" or "DEDUCTION"
 * @param {string} typeId - AllowanceType or DeductionType ID
 * @returns {Promise<{engine: Engine, rules: Array}>} Engine and associated rules
 */
const getCachedEngine = async (tenantId, ruleType, typeId) => {
    const cacheKey = `${tenantId}:${ruleType}:${typeId}`;
    const cached = engineCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        logger.debug(`Rule engine cache hit for ${cacheKey}`);
        return { engine: cached.engine, rules: cached.rules };
    }

    // Fetch rules from database
    const today = new Date();
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
        orderBy: { priority: "desc" },
    });

    // Create new engine and add rules
    const engine = createEngine();

    for (const rule of rules) {
        try {
            const convertedRule = convertRule(rule);
            engine.addRule(convertedRule);
        } catch (error) {
            logger.warn(`Failed to convert rule ${rule.id}: ${error.message}`);
        }
    }

    // Cache the engine
    engineCache.set(cacheKey, {
        engine,
        rules,
        timestamp: Date.now(),
    });

    logger.debug(`Rule engine cached for ${cacheKey} with ${rules.length} rules`);
    return { engine, rules };
};

/**
 * Evaluate rules against employee context
 * @param {string} ruleType - "ALLOWANCE" or "DEDUCTION"
 * @param {string} typeId - AllowanceType or DeductionType ID
 * @param {Object} employeeContext - Employee context data
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of matching rule events sorted by priority
 */
export const evaluateRules = async (ruleType, typeId, employeeContext, tenantId) => {
    try {
        const { engine, rules } = await getCachedEngine(tenantId, ruleType, typeId);

        if (rules.length === 0) {
            return [];
        }

        // Build facts from employee context
        const facts = { ...employeeContext };

        // Run the engine
        const { events } = await engine.run(facts);

        // Sort events by priority (highest first)
        const sortedEvents = events.sort((a, b) => (b.params?.priority || 0) - (a.params?.priority || 0));

        return sortedEvents;
    } catch (error) {
        logger.error(`Error evaluating rules: ${error.message}`, {
            error: error.stack,
            ruleType,
            typeId,
            tenantId,
        });
        return [];
    }
};

/**
 * Check if a single rule matches the employee context (for testing)
 * @param {Object} rule - CalculationRule object from database
 * @param {Object} employeeContext - Employee context data
 * @returns {Promise<boolean>} True if rule matches
 */
export const evaluateRule = async (rule, employeeContext) => {
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

    // Evaluate using engine
    const engine = createEngine();
    try {
        const convertedRule = convertRule(rule);
        engine.addRule(convertedRule);
        const facts = { ...employeeContext };
        const { events } = await engine.run(facts);
        return events.length > 0;
    } catch (error) {
        logger.error(`Error evaluating single rule: ${error.message}`);
        return false;
    }
};

/**
 * Calculate amount based on rule action
 * @param {Object} rule - Rule object (or action object)
 * @param {Object} employeeContext - Employee context data
 * @param {number} baseSalary - Employee's base salary
 * @param {number} grossSalary - Employee's gross salary
 * @param {Object} additionalVars - Additional variables for formula evaluation
 * @param {string} tenantId - Tenant ID for working days calculation
 * @returns {Promise<number>} Calculated amount
 */
export const calculateRuleAmount = async (rule, employeeContext, baseSalary, grossSalary, additionalVars = {}, tenantId = null) => {
    // Support both rule object (with rule.action) and direct action object
    const action = rule.action || rule;

    if (!action || typeof action !== "object") {
        return 0;
    }

    const { type, value, base } = action;

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
            // Use mathjs to evaluate the formula with tenant-specific working days
            const formulaResult = await evaluateFormula(
                String(value),
                baseSalary,
                grossSalary,
                employeeContext,
                additionalVars,
                tenantId
            );

            if (formulaResult.success) {
                logger.debug(`Formula evaluated: ${value} = ${formulaResult.result}`);
                return formulaResult.result;
            } else {
                logger.error(`Formula evaluation failed: ${formulaResult.error}`, {
                    formula: value,
                    baseSalary,
                    grossSalary,
                });
                // Return 0 on formula error to prevent incorrect calculations
                return 0;
            }

        default:
            logger.warn(`Unknown action type: ${type}`);
            return 0;
    }
};

/**
 * Get conditional amount for an allowance or deduction
 * Main entry point for conditional calculations
 * @param {string} ruleType - "ALLOWANCE" or "DEDUCTION"
 * @param {string} typeId - AllowanceType or DeductionType ID
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
        const matchingEvents = await evaluateRules(ruleType, typeId, employeeContext, tenantId);

        if (matchingEvents.length === 0) {
            return 0;
        }

        // Use the highest priority matching rule (first in sorted array)
        const topEvent = matchingEvents[0];
        const { action, ruleId, ruleName } = topEvent.params;

        const amount = await calculateRuleAmount(action, employeeContext, baseSalary, grossSalary, {}, tenantId);

        logger.info(`Conditional calculation applied: Rule ${ruleId} (${ruleName}) for ${ruleType} ${typeId}`, {
            ruleId,
            ruleName,
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

/**
 * Get all matching rules with their calculated amounts
 * Useful for debugging and showing breakdown to users
 * @param {string} ruleType - "ALLOWANCE" or "DEDUCTION"
 * @param {string} typeId - AllowanceType or DeductionType ID
 * @param {Object} employeeContext - Employee context data
 * @param {number} baseSalary - Employee's base salary
 * @param {number} grossSalary - Employee's gross salary
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Array>} Array of matching rules with amounts
 */
export const getAllMatchingRules = async (
    ruleType,
    typeId,
    employeeContext,
    baseSalary,
    grossSalary,
    tenantId
) => {
    try {
        const matchingEvents = await evaluateRules(ruleType, typeId, employeeContext, tenantId);

        const results = await Promise.all(
            matchingEvents.map(async (event) => {
                const { ruleId, ruleName, priority, action } = event.params;
                const amount = await calculateRuleAmount(action, employeeContext, baseSalary, grossSalary, {}, tenantId);

                return {
                    ruleId,
                    ruleName,
                    priority,
                    action,
                    calculatedAmount: amount,
                };
            })
        );

        return results;
    } catch (error) {
        logger.error(`Error getting all matching rules: ${error.message}`, {
            error: error.stack,
            ruleType,
            typeId,
            tenantId,
        });
        return [];
    }
};

/**
 * Validate rule conditions format
 * @param {Object} conditions - Conditions to validate
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
export const validateConditionsFormat = (conditions) => {
    const errors = [];

    const validateSingleCondition = (cond, path = "") => {
        if (!cond.field) {
            errors.push(`${path}: Missing 'field' property`);
        }
        if (!cond.operator) {
            errors.push(`${path}: Missing 'operator' property`);
        }
        if (cond.value === undefined) {
            errors.push(`${path}: Missing 'value' property`);
        }

        // Validate operator is supported
        const supportedOperators = [
            "equals",
            "notEquals",
            "greaterThan",
            "lessThan",
            "greaterThanOrEqual",
            "lessThanOrEqual",
            "in",
            "notIn",
            "contains",
            "startsWith",
            "endsWith",
            "dateBefore",
            "dateAfter",
            "dateEquals",
            "arrayContains",
            "arrayLength",
            "between",
            "notBetween",
            "matches",
            "isEmpty",
        ];

        if (cond.operator && !supportedOperators.includes(cond.operator)) {
            errors.push(`${path}: Unsupported operator '${cond.operator}'`);
        }
    };

    const validateTree = (node, path = "root") => {
        if (!node || typeof node !== "object") {
            errors.push(`${path}: Invalid condition node`);
            return;
        }

        // Single condition
        if (node.field && node.operator) {
            validateSingleCondition(node, path);
            return;
        }

        // Condition tree
        if (node.operator && node.conditions) {
            if (!["AND", "OR"].includes(node.operator)) {
                errors.push(`${path}: Invalid tree operator '${node.operator}' (must be AND or OR)`);
            }
            if (!Array.isArray(node.conditions)) {
                errors.push(`${path}: 'conditions' must be an array`);
                return;
            }
            node.conditions.forEach((cond, index) => {
                validateTree(cond, `${path}.conditions[${index}]`);
            });
            return;
        }

        errors.push(`${path}: Invalid condition structure`);
    };

    validateTree(conditions);

    return {
        valid: errors.length === 0,
        errors,
    };
};

/**
 * Get available operators with descriptions
 * @returns {Object} Map of operator names to descriptions
 */
export const getAvailableOperators = () => ({
    // Comparison operators
    equals: "Exact match (case-sensitive for strings)",
    notEquals: "Not equal to value",
    greaterThan: "Greater than (numeric comparison)",
    lessThan: "Less than (numeric comparison)",
    greaterThanOrEqual: "Greater than or equal to",
    lessThanOrEqual: "Less than or equal to",
    between: "Between min and max (inclusive) - value: { min, max }",
    notBetween: "Not between min and max - value: { min, max }",

    // Array operators
    in: "Value is in the provided array",
    notIn: "Value is not in the provided array",
    arrayContains: "Array fact contains the value",
    arrayLength: "Array length comparison - value: number or { operator, value }",

    // String operators
    contains: "String contains substring (case-insensitive)",
    startsWith: "String starts with value (case-insensitive)",
    endsWith: "String ends with value (case-insensitive)",
    matches: "String matches regex pattern",
    isEmpty: "Value is empty (string, array, or object) - value: true/false",

    // Date operators
    dateBefore: "Date is before the specified date",
    dateAfter: "Date is after the specified date",
    dateEquals: "Date is the same day as specified date",
});

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
export const getCacheStats = () => {
    const stats = {
        totalEntries: engineCache.size,
        entries: [],
    };

    engineCache.forEach((value, key) => {
        stats.entries.push({
            key,
            ruleCount: value.rules.length,
            age: Math.round((Date.now() - value.timestamp) / 1000) + "s",
            expired: Date.now() - value.timestamp >= CACHE_TTL,
        });
    });

    return stats;
};
