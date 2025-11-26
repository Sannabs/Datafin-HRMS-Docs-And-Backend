/**
 * Calculate the amount for a single allowance based on calculation method
 * @param {Object} allowance
 * @param {number} baseSalary
 * @returns {number}
 */
export const calculateAllowanceAmount = (allowance, baseSalary) => {
    const { amount, calculationMethod } = allowance;

    switch (calculationMethod) {
        case "FIXED":
            return amount;

        case "PERCENTAGE":
            // Amount represents percentage (e.g., 20 means 20% of base salary)
            return (baseSalary * amount) / 100;

        case "CONDITIONAL":
            // For conditional, amount is already calculated based on rules
            // This would need employee context (department, position, etc.)
            // For now, return the amount as-is
            return amount;

        default:
            return 0;
    }
};

/**
 * Calculate the amount for a single deduction based on calculation method
 * @param {Object} deduction
 * @param {number} grossSalary
 * @param {number} baseSalary
 * @returns {number}
 */
export const calculateDeductionAmount = (deduction, grossSalary, baseSalary) => {
    const { amount, calculationMethod } = deduction;

    switch (calculationMethod) {
        case "FIXED":
            return amount;

        case "PERCENTAGE":
            // Amount represents percentage (e.g., 15 means 15% of gross salary)
            return (grossSalary * amount) / 100;

        case "CONDITIONAL":
            // For conditional, amount is already calculated based on rules
            // This would need employee context (tax brackets, etc.)
            // For now, return the amount as-is
            return amount;

        default:
            return 0;
    }
};

/**
 * Calculate gross salary from base salary and allowances
 * @param {number} baseSalary
 * @param {Array} allowances
 * @returns {number}
 */
export const calculateGrossSalary = (baseSalary, allowances = []) => {
    if (!allowances || allowances.length === 0) {
        return baseSalary;
    }

    let totalAllowances = 0;

    for (const allowance of allowances) {
        const allowanceAmount = calculateAllowanceAmount(allowance, baseSalary);
        totalAllowances += allowanceAmount;
    }

    return baseSalary + totalAllowances;
};

/**
 * Calculate net salary from gross salary and deductions
 * @param {number} grossSalary
 * @param {Array} deductions
 * @param {number} baseSalary
 * @returns {number}
 */
export const calculateNetSalary = (grossSalary, deductions = [], baseSalary = 0) => {
    if (!deductions || deductions.length === 0) {
        return grossSalary;
    }

    let totalDeductions = 0;

    for (const deduction of deductions) {
        const deductionAmount = calculateDeductionAmount(deduction, grossSalary, baseSalary);
        totalDeductions += deductionAmount;
    }

    const netSalary = grossSalary - totalDeductions;

    // Business rule: Net salary cannot be negative
    // If deductions exceed gross, return 0 (may need manual review in production)
    return Math.max(0, netSalary);
};

/**
 * Main function to call when allowances/deductions change
 * @param {number} baseSalary
 * @param {Array} allowances
 * @param {Array} deductions
 * @returns {Object}
 */
export const recalculateSalary = (baseSalary, allowances = [], deductions = []) => {
    const grossSalary = calculateGrossSalary(baseSalary, allowances);
    const netSalary = calculateNetSalary(grossSalary, deductions, baseSalary);

    return {
        grossSalary,
        netSalary,
    };
};

