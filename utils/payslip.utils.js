import prisma from "../config/prisma.config.js";
import { getSalaryBreakdownItemized } from "../calculations/salary-calculations.js";

/**
 * Get itemized allowances and deductions breakdown for a payslip with calculated amounts
 * (FIXED, PERCENTAGE of base/gross, or FORMULA result).
 * @param {string} userId - Employee user ID
 * @param {string} tenantId - Tenant ID
 * @param {Date} payPeriodStartDate - Pay period start date
 * @param {Date} payPeriodEndDate - Pay period end date
 * @returns {Promise<Object>} Breakdown with base salary, currency, allowances, and deductions (each with calculated amount and calculationMethod/description)
 */
export const getPayslipBreakdown = async (userId, tenantId, payPeriodStartDate, payPeriodEndDate) => {
    const salaryStructure = await prisma.salaryStructure.findFirst({
        where: {
            userId,
            tenantId,
            effectiveDate: { lte: payPeriodEndDate },
            OR: [
                { endDate: null },
                { endDate: { gte: payPeriodStartDate } },
            ],
        },
        include: {
            allowances: {
                include: {
                    allowanceType: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            isTaxable: true,
                        },
                    },
                },
            },
            deductions: {
                include: {
                    deductionType: {
                        select: {
                            id: true,
                            name: true,
                            code: true,
                            isStatutory: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            effectiveDate: "desc",
        },
    });

    if (!salaryStructure) {
        return {
            baseSalary: 0,
            currency: "USD",
            allowances: [],
            deductions: [],
        };
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            departmentId: true,
            positionId: true,
            employmentType: true,
            status: true,
            hireDate: true,
        },
    });

    const employeeContext = user
        ? {
            departmentId: user.departmentId,
            positionId: user.positionId,
            employmentType: user.employmentType,
            status: user.status,
            hireDate: user.hireDate,
            baseSalary: salaryStructure.baseSalary,
          }
        : null;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { gambiaStatutoryEnabled: true },
    });

    const itemized = await getSalaryBreakdownItemized(
        salaryStructure.baseSalary,
        salaryStructure.allowances,
        salaryStructure.deductions,
        employeeContext,
        tenantId,
        tenant?.gambiaStatutoryEnabled ?? false
    );

    return {
        baseSalary: salaryStructure.baseSalary,
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
    };
};

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = "USD") => {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(amount || 0);
};

/**
 * Sanitize a period name (or any string) for safe use in filenames (ASCII, no quotes/newlines).
 * @param {string | null | undefined} periodName - Raw period name
 * @param {string} fallback - Value to use when result would be empty (default: "file")
 * @returns {string}
 */
export const sanitizePeriodNameForFilename = (periodName, fallback = "file") => {
    const raw = (periodName ?? "")
        .replace(/[\s"\\\r\n]+/g, "-")
        .replace(/[^\w\-.]/g, "");
    return raw || fallback;
};

