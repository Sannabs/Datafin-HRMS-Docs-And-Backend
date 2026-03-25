import prisma from "../config/prisma.config.js";
import { recalculateSalary } from "../calculations/salary-calculations.js";
import { validateFormula } from "./formula-evaluator.service.js";

async function getFormulaFromRuleId(calculationRuleId, tenantId) {
    if (!calculationRuleId || !tenantId) return null;
    const rule = await prisma.calculationRule.findFirst({
        where: { id: calculationRuleId, tenantId, deletedAt: null },
        select: { action: true },
    });
    if (!rule?.action || typeof rule.action !== "object") return null;
    const { type, value } = rule.action;
    if (type === "FORMULA" && typeof value === "string" && value.trim()) return value.trim();
    return null;
}

/**
 * Latest salary structure for employee in tenant.
 */
export async function findLatestSalaryStructureForUser(tenantId, userId) {
    return prisma.salaryStructure.findFirst({
        where: { tenantId, userId },
        orderBy: { effectiveDate: "desc" },
        include: {
            allowances: { include: { allowanceType: true } },
            deductions: { include: { deductionType: true } },
        },
    });
}

const lineSelect = {
    amount: true,
    calculationMethod: true,
    amountPeriodType: true,
    formulaExpression: true,
    calculationRuleId: true,
};

/**
 * Latest salary structure per user (by effectiveDate desc); map userId -> allowance line for type, if present.
 * @returns {Promise<Record<string, object>>}
 */
export async function mapLatestAllowanceLineByUser(tenantId, allowanceTypeId) {
    const structures = await prisma.salaryStructure.findMany({
        where: { tenantId },
        orderBy: { effectiveDate: "desc" },
        select: {
            userId: true,
            allowances: {
                where: { allowanceTypeId },
                select: lineSelect,
                take: 1,
            },
        },
    });
    const out = {};
    const seen = new Set();
    for (const s of structures) {
        if (seen.has(s.userId)) continue;
        seen.add(s.userId);
        const line = s.allowances[0];
        if (line) out[s.userId] = line;
    }
    return out;
}

/**
 * Same as mapLatestAllowanceLineByUser for deduction lines.
 * @returns {Promise<Record<string, object>>}
 */
export async function mapLatestDeductionLineByUser(tenantId, deductionTypeId) {
    const structures = await prisma.salaryStructure.findMany({
        where: { tenantId },
        orderBy: { effectiveDate: "desc" },
        select: {
            userId: true,
            deductions: {
                where: { deductionTypeId },
                select: lineSelect,
                take: 1,
            },
        },
    });
    const out = {};
    const seen = new Set();
    for (const s of structures) {
        if (seen.has(s.userId)) continue;
        seen.add(s.userId);
        const line = s.deductions[0];
        if (line) out[s.userId] = line;
    }
    return out;
}

/**
 * Add or replace one allowance line on structure (by allowanceTypeId).
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function upsertAllowanceLineOnStructure(tenantId, salaryStructureId, allowance) {
    const method = allowance.calculationMethod || "FIXED";
    let formulaExpression = allowance.formulaExpression?.trim() || null;
    const calculationRuleId = allowance.calculationRuleId || null;

    if (method === "FORMULA") {
        if (!formulaExpression && calculationRuleId) {
            formulaExpression = await getFormulaFromRuleId(calculationRuleId, tenantId);
        }
        if (!formulaExpression) {
            return {
                ok: false,
                message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA for allowances",
            };
        }
        const validation = validateFormula(formulaExpression);
        if (!validation.valid) {
            return { ok: false, message: `Invalid allowance formula: ${validation.error}` };
        }
    }

    const amountPeriodType =
        method === "FIXED" &&
        (allowance.amountPeriodType === "ANNUAL" || allowance.amountPeriodType === "MONTHLY")
            ? allowance.amountPeriodType
            : "MONTHLY";

    await prisma.allowance.deleteMany({
        where: {
            salaryStructureId,
            allowanceTypeId: allowance.allowanceTypeId,
        },
    });

    await prisma.allowance.create({
        data: {
            salaryStructureId,
            allowanceTypeId: allowance.allowanceTypeId,
            amount: method === "FORMULA" ? 0 : (allowance.amount ?? 0),
            amountPeriodType,
            calculationMethod: method,
            formulaExpression: method === "FORMULA" ? formulaExpression : null,
            calculationRuleId: method === "FORMULA" ? calculationRuleId : null,
        },
    });

    return recalcGrossForStructure(tenantId, salaryStructureId);
}

/**
 * Add or replace one deduction line on structure.
 */
export async function upsertDeductionLineOnStructure(tenantId, salaryStructureId, deduction) {
    const method = deduction.calculationMethod || "FIXED";
    let formulaExpression = deduction.formulaExpression?.trim() || null;
    const calculationRuleId = deduction.calculationRuleId || null;

    if (method === "FORMULA") {
        if (!formulaExpression && calculationRuleId) {
            formulaExpression = await getFormulaFromRuleId(calculationRuleId, tenantId);
        }
        if (!formulaExpression) {
            return {
                ok: false,
                message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA for deductions",
            };
        }
        const validation = validateFormula(formulaExpression);
        if (!validation.valid) {
            return { ok: false, message: `Invalid deduction formula: ${validation.error}` };
        }
    }

    const amountPeriodType =
        method === "FIXED" &&
        (deduction.amountPeriodType === "ANNUAL" || deduction.amountPeriodType === "MONTHLY")
            ? deduction.amountPeriodType
            : "MONTHLY";

    await prisma.deduction.deleteMany({
        where: {
            salaryStructureId,
            deductionTypeId: deduction.deductionTypeId,
        },
    });

    await prisma.deduction.create({
        data: {
            salaryStructureId,
            deductionTypeId: deduction.deductionTypeId,
            amount: method === "FORMULA" ? 0 : (deduction.amount ?? 0),
            amountPeriodType,
            calculationMethod: method,
            formulaExpression: method === "FORMULA" ? formulaExpression : null,
            calculationRuleId: method === "FORMULA" ? calculationRuleId : null,
        },
    });

    return recalcGrossForStructure(tenantId, salaryStructureId);
}

async function recalcGrossForStructure(tenantId, salaryStructureId) {
    const currentStructure = await prisma.salaryStructure.findFirst({
        where: { id: salaryStructureId, tenantId },
        include: {
            allowances: { include: { allowanceType: true } },
            deductions: { include: { deductionType: true } },
        },
    });
    if (!currentStructure) {
        return { ok: false, message: "Salary structure not found" };
    }

    const employee = await prisma.user.findFirst({
        where: { id: currentStructure.userId, tenantId, isDeleted: false },
        select: { departmentId: true, positionId: true, employmentType: true, status: true, hireDate: true },
    });
    const employeeContext = employee
        ? {
              departmentId: employee.departmentId,
              positionId: employee.positionId,
              employmentType: employee.employmentType,
              baseSalary: Number(currentStructure.baseSalary),
              status: employee.status,
              hireDate: employee.hireDate,
          }
        : null;

    const { grossSalary } = await recalculateSalary(
        currentStructure.baseSalary,
        currentStructure.allowances,
        currentStructure.deductions,
        employeeContext,
        tenantId
    );

    await prisma.salaryStructure.update({
        where: { id: salaryStructureId },
        data: { grossSalary },
    });

    return { ok: true };
}
