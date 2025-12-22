import { create, all } from "mathjs";
import logger from "../utils/logger.js";
import {
    calculateWorkingDays,
    getWorkingDaysInCurrentMonth,
} from "../utils/working-days.utils.js";

// Create a restricted mathjs instance for safe evaluation
const math = create(all);

// List of allowed functions (whitelist approach for security)
const ALLOWED_FUNCTIONS = [
    // Basic math
    "add", "subtract", "multiply", "divide", "mod",
    "abs", "ceil", "floor", "round", "trunc",
    "min", "max", "pow", "sqrt", "cbrt",
    "exp", "log", "log10", "log2",

    // Comparison (return 1 or 0)
    "equal", "unequal", "larger", "largerEq", "smaller", "smallerEq",

    // Conditional
    "if", // if(condition, trueValue, falseValue)

    // Type checking
    "isInteger", "isNaN", "isPositive", "isNegative", "isZero",

    // Statistics (useful for arrays)
    "sum", "mean", "median", "std", "variance",
];

// List of dangerous functions to remove
const DANGEROUS_FUNCTIONS = [
    "import", "createUnit", "evaluate", "parse", "compile",
    "Parser", "FunctionNode", "ConstantNode", "SymbolNode",
    "chain", "typed", "config", "on", "off", "once", "emit",
    "resolve", "simplify", "derivative", "rationalize",
];

// Remove dangerous functions from mathjs
DANGEROUS_FUNCTIONS.forEach((fn) => {
    if (math[fn]) {
        delete math[fn];
    }
});

// Also limit the import functionality
math.import({
    import: function () {
        throw new Error("Function import is disabled for security reasons");
    },
    createUnit: function () {
        throw new Error("Function createUnit is disabled for security reasons");
    },
    evaluate: function () {
        throw new Error("Function evaluate is disabled for security reasons");
    },
    parse: function () {
        throw new Error("Function parse is disabled for security reasons");
    },
}, { override: true });

/**
 * Available variables that can be used in formulas
 */
export const FORMULA_VARIABLES = {
    baseSalary: "Employee's base salary",
    grossSalary: "Employee's calculated gross salary",
    netSalary: "Employee's calculated net salary (if available)",
    totalAllowances: "Sum of all allowances",
    totalDeductions: "Sum of all deductions",
    yearsOfService: "Years since employee was hired",
    daysInMonth: "Number of days in the current pay period month",
    workingDays: "Number of working days in the month",
    hoursWorked: "Hours worked (if available in context)",
    overtimeHours: "Overtime hours (if available in context)",
};

/**
 * Build the scope object for formula evaluation (synchronous - for validation)
 * Uses estimated working days without tenant-specific holidays
 * @param {number} baseSalary - Employee's base salary
 * @param {number} grossSalary - Employee's gross salary
 * @param {Object} employeeContext - Additional employee context
 * @param {Object} additionalVars - Any additional variables to include
 * @returns {Object} Scope object for mathjs evaluation
 */
export const buildFormulaScope = (
    baseSalary,
    grossSalary,
    employeeContext = {},
    additionalVars = {}
) => {
    const today = new Date();
    const hireDate = employeeContext.hireDate ? new Date(employeeContext.hireDate) : null;

    // Calculate years of service
    let yearsOfService = 0;
    if (hireDate) {
        const diffTime = Math.abs(today - hireDate);
        yearsOfService = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
    }

    // Calculate days in current month
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

    // Use synchronous working days calculation (excludes weekends, not holidays)
    const workingDays = getWorkingDaysInCurrentMonth();

    const scope = {
        // Core salary values
        baseSalary: Number(baseSalary) || 0,
        grossSalary: Number(grossSalary) || 0,
        netSalary: Number(additionalVars.netSalary) || 0,

        // Aggregates
        totalAllowances: Number(additionalVars.totalAllowances) || 0,
        totalDeductions: Number(additionalVars.totalDeductions) || 0,

        // Time-based
        yearsOfService,
        daysInMonth,
        workingDays,

        // From employee context (flatten for easy access)
        hoursWorked: Number(employeeContext.hoursWorked) || 0,
        overtimeHours: Number(employeeContext.overtimeHours) || 0,
        bonus: Number(employeeContext.bonus) || 0,

        // Mathematical constants (safe to expose)
        PI: Math.PI,
        E: Math.E,

        // Custom helper values
        ...additionalVars,
    };

    // Add all numeric values from employeeContext with 'ctx_' prefix
    // This allows access to custom fields like ctx_performanceScore
    Object.entries(employeeContext).forEach(([key, value]) => {
        if (typeof value === "number" || !isNaN(Number(value))) {
            scope[`ctx_${key}`] = Number(value);
        }
    });

    return scope;
};

/**
 * Build the scope object for formula evaluation (async - for actual payroll)
 * Uses tenant-specific working days calculation with holidays
 * @param {number} baseSalary - Employee's base salary
 * @param {number} grossSalary - Employee's gross salary
 * @param {Object} employeeContext - Additional employee context
 * @param {Object} additionalVars - Any additional variables to include
 * @param {string} tenantId - Tenant ID for holiday/weekend lookup
 * @returns {Promise<Object>} Scope object for mathjs evaluation
 */
export const buildFormulaScopeAsync = async (
    baseSalary,
    grossSalary,
    employeeContext = {},
    additionalVars = {},
    tenantId = null
) => {
    const today = new Date();
    const hireDate = employeeContext.hireDate ? new Date(employeeContext.hireDate) : null;

    // Calculate years of service
    let yearsOfService = 0;
    if (hireDate) {
        const diffTime = Math.abs(today - hireDate);
        yearsOfService = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 365.25));
    }

    // Calculate days in current month
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Calculate working days using tenant-specific holidays and weekend config
    let workingDays;
    if (tenantId) {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);
        workingDays = await calculateWorkingDays(startDate, endDate, tenantId);
    } else {
        workingDays = getWorkingDaysInCurrentMonth();
    }

    const scope = {
        // Core salary values
        baseSalary: Number(baseSalary) || 0,
        grossSalary: Number(grossSalary) || 0,
        netSalary: Number(additionalVars.netSalary) || 0,

        // Aggregates
        totalAllowances: Number(additionalVars.totalAllowances) || 0,
        totalDeductions: Number(additionalVars.totalDeductions) || 0,

        // Time-based
        yearsOfService,
        daysInMonth,
        workingDays,

        // From employee context (flatten for easy access)
        hoursWorked: Number(employeeContext.hoursWorked) || 0,
        overtimeHours: Number(employeeContext.overtimeHours) || 0,
        bonus: Number(employeeContext.bonus) || 0,

        // Mathematical constants (safe to expose)
        PI: Math.PI,
        E: Math.E,

        // Custom helper values
        ...additionalVars,
    };

    // Add all numeric values from employeeContext with 'ctx_' prefix
    Object.entries(employeeContext).forEach(([key, value]) => {
        if (typeof value === "number" || !isNaN(Number(value))) {
            scope[`ctx_${key}`] = Number(value);
        }
    });

    return scope;
};

/**
 * Validate a formula string for syntax errors
 * @param {string} formula - The formula to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export const validateFormula = (formula) => {
    if (!formula || typeof formula !== "string") {
        return { valid: false, error: "Formula must be a non-empty string" };
    }

    // Check for obviously dangerous patterns
    const dangerousPatterns = [
        /import\s*\(/i,
        /require\s*\(/i,
        /eval\s*\(/i,
        /Function\s*\(/i,
        /setTimeout/i,
        /setInterval/i,
        /process\./i,
        /global\./i,
        /__proto__/i,
        /constructor/i,
        /prototype/i,
    ];

    for (const pattern of dangerousPatterns) {
        if (pattern.test(formula)) {
            return { valid: false, error: "Formula contains disallowed patterns" };
        }
    }

    // compile the formula to check syntax
    try {
        // 
        // minimal scope for validation
        const testScope = {
            baseSalary: 50000,
            grossSalary: 60000,
            netSalary: 55000,
            totalAllowances: 10000,
            totalDeductions: 5000,
            yearsOfService: 5,
            daysInMonth: 30,
            workingDays: 22,
            hoursWorked: 160,
            overtimeHours: 10,
            bonus: 1000,
            PI: Math.PI,
            E: Math.E,
        };

        // Attempt evaluation with test values
        const result = math.evaluate(formula, testScope);

        // Check if result is a valid number
        if (typeof result !== "number" || isNaN(result) || !isFinite(result)) {
            return {
                valid: false,
                error: "Formula must evaluate to a finite number"
            };
        }

        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: `Formula syntax error: ${error.message}`
        };
    }
};

/**
 * Evaluate a formula with given scope (async version with tenant support)
 * @param {string} formula - The formula to evaluate
 * @param {number} baseSalary - Employee's base salary
 * @param {number} grossSalary - Employee's gross salary
 * @param {Object} employeeContext - Additional employee context
 * @param {Object} additionalVars - Any additional variables
 * @param {string} tenantId - Optional tenant ID for accurate working days calculation
 * @returns {Promise<{ success: boolean, result?: number, error?: string }>} Evaluation result
 */
export const evaluateFormula = async (
    formula,
    baseSalary,
    grossSalary,
    employeeContext = {},
    additionalVars = {},
    tenantId = null
) => {
    // Validate first
    const validation = validateFormula(formula);
    if (!validation.valid) {
        logger.warn(`Formula validation failed: ${validation.error}`, { formula });
        return { success: false, error: validation.error };
    }

    try {
        // Use async scope builder when tenantId is available for accurate working days
        const scope = tenantId
            ? await buildFormulaScopeAsync(baseSalary, grossSalary, employeeContext, additionalVars, tenantId)
            : buildFormulaScope(baseSalary, grossSalary, employeeContext, additionalVars);

        const result = math.evaluate(formula, scope);

        // Ensure result is a valid number
        if (typeof result !== "number" || isNaN(result)) {
            return {
                success: false,
                error: "Formula did not evaluate to a valid number"
            };
        }

        // Handle infinity (e.g., division by zero)
        if (!isFinite(result)) {
            logger.warn(`Formula evaluated to infinity`, { formula, result });
            return {
                success: false,
                error: "Formula evaluated to infinity (possible division by zero)"
            };
        }

        // Round to 2 decimal places for currency
        const roundedResult = Math.round(result * 100) / 100;

        logger.debug(`Formula evaluated successfully`, {
            formula,
            result: roundedResult,
            scopeKeys: Object.keys(scope),
            tenantId: tenantId || "none",
        });

        return { success: true, result: roundedResult };
    } catch (error) {
        logger.error(`Formula evaluation error: ${error.message}`, {
            formula,
            error: error.stack
        });
        return {
            success: false,
            error: `Evaluation error: ${error.message}`
        };
    }
};

/**
 * Get list of variables used in a formula
 * @param {string} formula - The formula to analyze
 * @returns {string[]} List of variable names found in the formula
 */
export const extractFormulaVariables = (formula) => {
    if (!formula || typeof formula !== "string") {
        return [];
    }

    // Known variable names to look for
    const knownVariables = [
        "baseSalary", "grossSalary", "netSalary",
        "totalAllowances", "totalDeductions",
        "yearsOfService", "daysInMonth", "workingDays",
        "hoursWorked", "overtimeHours", "bonus",
        "PI", "E",
    ];

    const foundVariables = [];

    for (const varName of knownVariables) {
        // Use word boundary to match whole variable names
        const regex = new RegExp(`\\b${varName}\\b`);
        if (regex.test(formula)) {
            foundVariables.push(varName);
        }
    }

    // Also find ctx_ prefixed variables
    const ctxMatches = formula.match(/\bctx_\w+/g);
    if (ctxMatches) {
        foundVariables.push(...ctxMatches);
    }

    return [...new Set(foundVariables)]; // Remove duplicates
};

/**
 * Get all available functions that can be used in formulas
 * @returns {Object} Map of function names to descriptions
 */
export const getAvailableFunctions = () => ({
    // Basic math
    "add(a, b)": "Addition: add(5, 3) = 8",
    "subtract(a, b)": "Subtraction: subtract(5, 3) = 2",
    "multiply(a, b)": "Multiplication: multiply(5, 3) = 15",
    "divide(a, b)": "Division: divide(6, 3) = 2",
    "mod(a, b)": "Modulo: mod(5, 3) = 2",

    // Rounding
    "round(x)": "Round to nearest integer: round(4.5) = 5",
    "floor(x)": "Round down: floor(4.9) = 4",
    "ceil(x)": "Round up: ceil(4.1) = 5",
    "trunc(x)": "Truncate decimal: trunc(4.9) = 4",

    // Common functions
    "abs(x)": "Absolute value: abs(-5) = 5",
    "min(a, b, ...)": "Minimum value: min(3, 1, 4) = 1",
    "max(a, b, ...)": "Maximum value: max(3, 1, 4) = 4",
    "pow(x, n)": "Power: pow(2, 3) = 8",
    "sqrt(x)": "Square root: sqrt(16) = 4",

    // Conditional
    "if(cond, true, false)": "Conditional: if(baseSalary > 50000, 1000, 500)",

    // Comparison (returns 1 for true, 0 for false)
    "larger(a, b)": "Greater than: larger(5, 3) = 1",
    "smaller(a, b)": "Less than: smaller(5, 3) = 0",
    "equal(a, b)": "Equals: equal(5, 5) = 1",
});

/**
 * Get example formulas for documentation
 * @returns {Array} Array of example formulas with descriptions
 */
export const getFormulaExamples = () => [
    {
        name: "Fixed percentage of base salary",
        formula: "baseSalary * 0.1",
        description: "10% of base salary",
    },
    {
        name: "Tiered bonus based on salary",
        formula: "if(baseSalary > 100000, baseSalary * 0.15, baseSalary * 0.10)",
        description: "15% if salary > 100k, otherwise 10%",
    },
    {
        name: "Service-based allowance",
        formula: "500 + (yearsOfService * 100)",
        description: "Base 500 + 100 per year of service",
    },
    {
        name: "Combined calculation",
        formula: "(baseSalary * 0.05) + (grossSalary * 0.02) + 200",
        description: "5% of base + 2% of gross + 200 fixed",
    },
    {
        name: "Overtime pay",
        formula: "(baseSalary / workingDays / 8) * overtimeHours * 1.5",
        description: "Hourly rate × overtime hours × 1.5",
    },
    {
        name: "Pro-rated deduction",
        formula: "grossSalary * 0.12 * (daysInMonth / 30)",
        description: "12% of gross, pro-rated for month length",
    },
    {
        name: "Capped allowance",
        formula: "min(baseSalary * 0.2, 10000)",
        description: "20% of base salary, capped at 10,000",
    },
    {
        name: "Minimum guarantee",
        formula: "max(baseSalary * 0.05, 1000)",
        description: "5% of base salary, minimum 1,000",
    },
];

