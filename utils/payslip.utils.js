import prisma from "../config/prisma.config.js";

/**
 * Get itemized allowances and deductions breakdown for a payslip
 * @param {string} userId - Employee user ID
 * @param {string} tenantId - Tenant ID
 * @param {Date} payPeriodStartDate - Pay period start date
 * @param {Date} payPeriodEndDate - Pay period end date
 * @returns {Promise<Object>} Breakdown with base salary, currency, allowances, and deductions
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

    return {
        baseSalary: salaryStructure?.baseSalary || 0,
        currency: salaryStructure?.currency || "USD",
        allowances: salaryStructure?.allowances.map((a) => ({
            id: a.id,
            name: a.allowanceType.name,
            code: a.allowanceType.code,
            amount: a.amount,
            calculationMethod: a.calculationMethod,
            isTaxable: a.allowanceType.isTaxable,
        })) || [],
        deductions: salaryStructure?.deductions.map((d) => ({
            id: d.id,
            name: d.deductionType.name,
            code: d.deductionType.code,
            amount: d.amount,
            calculationMethod: d.calculationMethod,
            isStatutory: d.deductionType.isStatutory,
        })) || [],
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

