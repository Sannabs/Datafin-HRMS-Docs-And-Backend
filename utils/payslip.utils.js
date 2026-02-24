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

    // Use monthly base for all calculations (convert annual to monthly once)
    const baseSalaryMonthly =
        salaryStructure.salaryPeriodType === "ANNUAL"
            ? salaryStructure.baseSalary / 12
            : salaryStructure.baseSalary;

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
            baseSalary: baseSalaryMonthly,
          }
        : null;

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { gambiaStatutoryEnabled: true, employerSocialSecurityRate: true },
    });

    const itemized = await getSalaryBreakdownItemized(
        baseSalaryMonthly,
        salaryStructure.allowances,
        salaryStructure.deductions,
        employeeContext,
        tenantId,
        tenant?.gambiaStatutoryEnabled ?? false
    );

    const grossSalaryForEmployer =
        baseSalaryMonthly + itemized.allowanceLines.reduce((sum, l) => sum + (l.amount || 0), 0);
    const employerRate = tenant?.employerSocialSecurityRate != null ? Number(tenant.employerSocialSecurityRate) : null;
    const employerSSHFCAmount =
        employerRate != null && !Number.isNaN(employerRate)
            ? Math.round(grossSalaryForEmployer * (employerRate / 100) * 100) / 100
            : null;

    return {
        baseSalary: baseSalaryMonthly,
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
        ...(employerRate != null &&
            employerSSHFCAmount != null && {
                employerSSHFCRate: employerRate,
                employerSSHFCAmount,
            }),
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

/**
 * Get year-to-date totals for an employee (same tenant, same calendar year, periods ending on or before the given date).
 * @param {string} userId - Employee user ID
 * @param {string} tenantId - Tenant ID
 * @param {Date} periodEndDate - Pay period end date (inclusive; YTD includes all periods in that year up to this date)
 * @returns {Promise<{ grossSalaryYTD: number, totalDeductionsYTD: number, netSalaryYTD: number }>}
 */
export const getPayslipYTD = async (userId, tenantId, periodEndDate) => {
    const end = periodEndDate instanceof Date ? periodEndDate : new Date(periodEndDate);
    const year = end.getFullYear();
    const startOfYear = new Date(year, 0, 1);

    const agg = await prisma.payslip.aggregate({
        where: {
            userId,
            payrollRun: {
                tenantId,
                payPeriod: {
                    endDate: { gte: startOfYear, lte: end },
                },
            },
        },
        _sum: {
            grossSalary: true,
            totalDeductions: true,
            netSalary: true,
        },
    });

    return {
        grossSalaryYTD: Math.round((agg._sum.grossSalary ?? 0) * 100) / 100,
        totalDeductionsYTD: Math.round((agg._sum.totalDeductions ?? 0) * 100) / 100,
        netSalaryYTD: Math.round((agg._sum.netSalary ?? 0) * 100) / 100,
    };
};

