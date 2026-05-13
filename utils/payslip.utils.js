import prisma from "../config/prisma.config.js";
import { getSalaryBreakdownItemized } from "../calculations/salary-calculations.js";
import {
    buildGambiaEmployerContributionLines,
    resolveEmployerSocialSecurityRatePercent,
} from "../constants/gambia-payroll.defaults.js";
import {
    computeOvertimePayAmount,
    getOvertimePayrollState,
} from "./overtime-payroll.util.js";

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
            currency: "GMD",
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
            dateOfBirth: true,
        },
    });

    const [tenant, payPeriod] = await Promise.all([
        prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                gambiaStatutoryEnabled: true,
                employerSocialSecurityRate: true,
                gambiaSsnFundingMode: true,
                gambiaTaxAgeExemptionEnabled: true,
                gambiaTaxExemptionAge: true,
                overtimeEnabled: true,
                overtimePayMultiplier: true,
            },
        }),
        prisma.payPeriod.findFirst({
            where: {
                tenantId,
                startDate: payPeriodStartDate,
                endDate: payPeriodEndDate,
            },
        }),
    ]);

    let payableOvertimeHours = 0;
    let overtimeProjectionNote = null;
    if (user && payPeriod) {
        const otState = await getOvertimePayrollState(
            userId,
            tenantId,
            payPeriod.id,
            payPeriodStartDate,
            payPeriodEndDate
        );
        if (otState.rawHours > 0 && otState.blocked) {
            overtimeProjectionNote =
                "Recorded overtime exists but is not approved or rejected by HR; overtime pay is not included in this estimate.";
        }
        payableOvertimeHours = otState.payableHours;
    }

    const employeeContext = user
        ? {
            departmentId: user.departmentId,
            positionId: user.positionId,
            employmentType: user.employmentType,
            status: user.status,
            hireDate: user.hireDate,
            dateOfBirth: user.dateOfBirth,
            baseSalary: baseSalaryMonthly,
            overtimeHours: payableOvertimeHours,
          }
        : null;

    const getAgeFromDate = (date) => {
        if (!date) return null;
        const today = new Date();
        const dob = new Date(date);
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
        }
        return age;
    };

    const employeeAge = user ? getAgeFromDate(user.dateOfBirth) : null;
    const isGambiaTaxExempt =
        Boolean(tenant?.gambiaStatutoryEnabled) &&
        Boolean(tenant?.gambiaTaxAgeExemptionEnabled) &&
        tenant?.gambiaTaxExemptionAge != null &&
        employeeAge != null &&
        employeeAge >= tenant.gambiaTaxExemptionAge;

    const formulaScopeOptions = {
        payPeriodStartDate,
        payPeriodEndDate,
    };

    const overtimeEnabled = tenant?.overtimeEnabled !== false;
    const multiplier =
        overtimeEnabled &&
        tenant?.overtimePayMultiplier != null &&
        Number(tenant.overtimePayMultiplier) > 0
            ? Number(tenant.overtimePayMultiplier)
            : 1.5;

    const supplementalAllowanceLines = [];
    if (overtimeEnabled && payableOvertimeHours > 0 && user) {
        const ot = await computeOvertimePayAmount(
            baseSalaryMonthly,
            tenantId,
            payPeriodStartDate,
            payPeriodEndDate,
            payableOvertimeHours,
            multiplier
        );
        supplementalAllowanceLines.push({
            name: "Overtime pay",
            amount: ot.amount,
            calculationMethod: "OVERTIME",
            description: ot.description,
        });
    }

    const itemized = await getSalaryBreakdownItemized(
        baseSalaryMonthly,
        salaryStructure.allowances,
        salaryStructure.deductions,
        employeeContext,
        tenantId,
        tenant?.gambiaStatutoryEnabled ?? false,
        tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE",
        isGambiaTaxExempt,
        formulaScopeOptions,
        supplementalAllowanceLines
    );

    const ssnFundingMode = tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE";
    const employerRate = resolveEmployerSocialSecurityRatePercent(
        tenant?.employerSocialSecurityRate ?? null,
        tenant?.gambiaStatutoryEnabled ?? false
    );
    const employerContributions =
        tenant?.gambiaStatutoryEnabled
            ? buildGambiaEmployerContributionLines(baseSalaryMonthly, ssnFundingMode, employerRate ?? 0)
            : [];
    const employerSSHFCLine = employerContributions.find((l) => l.name === "Employer SSHFC") ?? null;

    return {
        baseSalary: baseSalaryMonthly,
        currency: salaryStructure.currency || "GMD",
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
        ...(tenant?.gambiaStatutoryEnabled && {
            gambiaSsnFundingMode: ssnFundingMode,
            employerContributions,
        }),
        ...(employerRate != null &&
            employerSSHFCLine?.amount != null && {
                employerSSHFCRate: employerRate,
                employerSSHFCAmount: employerSSHFCLine.amount,
            }),
        ...(overtimeProjectionNote && { overtimeProjectionNote }),
    };
};

/** Display symbols aligned with frontend (GMD → D, not ISO "GMD" from Intl). */
const CURRENCY_SYMBOLS = {
    USD: "$",
    GMD: "D",
    XOF: "CFA",
    EUR: "€",
    GBP: "£",
};

/**
 * Format currency value
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: GMD)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency = "GMD") => {
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    const formatted = new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount || 0);
    return `${symbol}${formatted}`;
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

/** Deduction line label used when Gambia statutory PAYE is applied (see payroll-run.service breakdown). */
export const PAYE_GRA_DEDUCTION_NAME = "PAYE (GRA)";

/**
 * Extract GRA PAYE amount from a payslip breakdown snapshot (0 if missing).
 * @param {unknown} breakdownSnapshot
 * @returns {number}
 */
export const getPayeFromBreakdownSnapshot = (breakdownSnapshot) => {
    if (!breakdownSnapshot || typeof breakdownSnapshot !== "object") return 0;
    const deds = breakdownSnapshot.deductions;
    if (!Array.isArray(deds)) return 0;
    const match =
        deds.find((d) => String(d?.name ?? "").trim() === PAYE_GRA_DEDUCTION_NAME) ||
        deds.find(
            (d) =>
                /paye/i.test(String(d?.name ?? "")) &&
                /gra/i.test(String(d?.name ?? ""))
        );
    const n = Number(match?.amount);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/**
 * Sum overtime pay amounts from payslip breakdown snapshots (YTD).
 * @param {string} userId
 * @param {string} tenantId
 * @param {Date} periodEndDate
 * @returns {Promise<{ overtimePayYTD: number, overtimeHoursYTD: number }>}
 */
export const getOvertimePayYtdForUser = async (userId, tenantId, periodEndDate) => {
    const end = periodEndDate instanceof Date ? periodEndDate : new Date(periodEndDate);
    const year = end.getFullYear();
    const startOfYear = new Date(year, 0, 1);

    const slips = await prisma.payslip.findMany({
        where: {
            userId,
            payrollRun: {
                tenantId,
                payPeriod: {
                    endDate: { gte: startOfYear, lte: end },
                },
            },
        },
        select: { breakdownSnapshot: true },
    });

    let overtimePayYTD = 0;
    let overtimeHoursYTD = 0;
    for (const p of slips) {
        const snap = p.breakdownSnapshot;
        const o = snap && typeof snap === "object" ? snap.overtime : null;
        if (o && typeof o === "object") {
            overtimePayYTD += Number(o.amount) || 0;
            overtimeHoursYTD += Number(o.hours) || 0;
        }
    }

    return {
        overtimePayYTD: Math.round(overtimePayYTD * 100) / 100,
        overtimeHoursYTD: Math.round(overtimeHoursYTD * 100) / 100,
    };
};

/**
 * Latest payslip for a user in a tenant with computed net pay, itemized breakdown (enriched), and YTD.
 * Shared by GET /payslips/my/latest and employee payroll overview.
 */
export const getLatestPayslipBundleForUser = async (userId, tenantId) => {
    const payslip = await prisma.payslip.findFirst({
        where: {
            userId,
            payrollRun: { tenantId },
        },
        orderBy: { generatedAt: "desc" },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    employeeId: true,
                    email: true,
                    image: true,
                    department: { select: { id: true, name: true } },
                    position: { select: { id: true, title: true } },
                },
            },
            payrollRun: {
                include: {
                    payPeriod: {
                        select: {
                            id: true,
                            periodName: true,
                            startDate: true,
                            endDate: true,
                        },
                    },
                },
            },
        },
    });

    if (!payslip) {
        return { payslip: null, netSalary: null, breakdown: null, ytd: null };
    }

    const storedNet = payslip.netSalary;
    const netSalary =
        storedNet != null && Number(storedNet) > 0
            ? Number(storedNet)
            : Math.max(
                  0,
                  Math.round(
                      ((Number(payslip.grossSalary) || 0) - (Number(payslip.totalDeductions) || 0)) * 100
                  ) / 100
              );

    let breakdown =
        payslip.breakdownSnapshot != null
            ? payslip.breakdownSnapshot
            : await getPayslipBreakdown(
                  payslip.userId,
                  tenantId,
                  payslip.payrollRun.payPeriod.startDate,
                  payslip.payrollRun.payPeriod.endDate
              );

    if (breakdown && (breakdown.employerSSHFCRate == null || breakdown.employerContributions == null)) {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                gambiaStatutoryEnabled: true,
                employerSocialSecurityRate: true,
                gambiaSsnFundingMode: true,
            },
        });
        const gambiaEnabled = tenant?.gambiaStatutoryEnabled ?? false;
        const ssnFundingMode =
            breakdown?.gambiaSsnFundingMode ?? tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE";
        const rate = resolveEmployerSocialSecurityRatePercent(
            tenant?.employerSocialSecurityRate ?? null,
            gambiaEnabled
        );
        const baseForSsn = Number(breakdown?.baseSalary) || 0;
        const employerContributions = gambiaEnabled
            ? buildGambiaEmployerContributionLines(baseForSsn, ssnFundingMode, rate ?? 0)
            : [];
        const employerSSHFCLine = employerContributions.find((l) => l.name === "Employer SSHFC") ?? null;
        const enriched = {
            ...(gambiaEnabled && { gambiaSsnFundingMode: ssnFundingMode, employerContributions }),
            ...(rate != null &&
                employerSSHFCLine?.amount != null && {
                    employerSSHFCRate: rate,
                    employerSSHFCAmount: employerSSHFCLine.amount,
                }),
        };
        if (Object.keys(enriched).length > 0) breakdown = { ...breakdown, ...enriched };
    }

    let ytd = null;
    if (payslip.payrollRun?.payPeriod?.endDate) {
        const end = payslip.payrollRun.payPeriod.endDate;
        const baseYtd = await getPayslipYTD(payslip.userId, tenantId, end);
        const otYtd = await getOvertimePayYtdForUser(payslip.userId, tenantId, end);
        ytd = { ...baseYtd, ...otYtd };
    }

    return { payslip, netSalary, breakdown, ytd };
};

/**
 * Current salary structure snapshot (as of today) for overview cards when no payslip exists
 * or to show contractual base + pay frequency.
 */
export const getCurrentCompensationFromSalaryStructure = async (userId, tenantId) => {
    const asOf = new Date();
    const row = await prisma.salaryStructure.findFirst({
        where: {
            userId,
            tenantId,
            effectiveDate: { lte: asOf },
            OR: [{ endDate: null }, { endDate: { gte: asOf } }],
        },
        orderBy: { effectiveDate: "desc" },
        select: {
            baseSalary: true,
            salaryPeriodType: true,
            currency: true,
        },
    });

    if (!row) return null;

    const monthly =
        row.salaryPeriodType === "ANNUAL" ? row.baseSalary / 12 : row.baseSalary;

    return {
        baseSalaryMonthly: Math.round(monthly * 100) / 100,
        salaryPeriodType: row.salaryPeriodType,
        payFrequencyLabel: row.salaryPeriodType === "ANNUAL" ? "Annual" : "Monthly",
        currency: row.currency || "GMD",
    };
};

