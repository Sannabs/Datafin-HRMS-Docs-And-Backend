import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import {
    mapLatestAllowanceLineByUser,
    mapLatestDeductionLineByUser,
} from "../services/batch-salary-line.service.js";
import { recalculateSalary } from "../calculations/salary-calculations.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import { validateFormula } from "../services/formula-evaluator.service.js";
import { calculateGambiaPAYE, GAMBIA_SSN_EMPLOYEE_RATE } from "../constants/gambia-payroll.defaults.js";

/**
 * Add computed netSalary and totalDeductions to a salary structure for API response.
 * Does not persist; only enriches the JSON.
 */
async function enrichWithNetAndTotalDeductions(structure, tenantId) {
    const { netSalary, totalDeductions } = await recalculateSalary(
        structure.baseSalary,
        structure.allowances || [],
        structure.deductions || [],
        null,
        tenantId
    );
    return { ...structure, netSalary, totalDeductions };
}

/**
 * Build virtual deduction lines for Gambia PAYE and SSN with computed amounts from gross (for structure display).
 */
function buildGambiaStatutoryDeductionLines(grossSalary, gambiaSsnFundingMode = "DEDUCT_FROM_EMPLOYEE") {
    const payeAmount = calculateGambiaPAYE(grossSalary);
    const lines = [
        {
            id: "statutory-paye",
            deductionTypeId: null,
            amount: payeAmount,
            calculationMethod: "FORMULA",
            formulaExpression: null,
            calculationRuleId: null,
            deductionType: { id: "", name: "PAYE (GRA)", code: "PAYE", isStatutory: true },
            isStatutoryDefault: true,
        },
    ];
    if (gambiaSsnFundingMode === "DEDUCT_FROM_EMPLOYEE") {
        lines.push({
            id: "statutory-ssn",
            deductionTypeId: null,
            amount: 5,
            calculationMethod: "PERCENTAGE",
            formulaExpression: null,
            calculationRuleId: null,
            deductionType: { id: "", name: "SSN - Employee", code: "SSN", isStatutory: true },
            isStatutoryDefault: true,
        });
    }
    return lines;
}

/**
 * If tenant has Gambia statutory enabled, append PAYE and SSN to structure.deductions with computed amounts,
 * and update totalDeductions and netSalary so the structure view shows correct totals.
 */
function appendGambiaStatutoryDeductionsIfEnabled(structure, gambiaStatutoryEnabled, gambiaSsnFundingMode = "DEDUCT_FROM_EMPLOYEE") {
    if (!gambiaStatutoryEnabled || structure.grossSalary == null) return structure;
    const grossSalary = Number(structure.grossSalary) || 0;
    const payeAmount = calculateGambiaPAYE(grossSalary);
    const ssnAmount =
        gambiaSsnFundingMode === "DEDUCT_FROM_EMPLOYEE"
            ? Math.round(grossSalary * GAMBIA_SSN_EMPLOYEE_RATE * 100) / 100
            : 0;
    const statutoryTotal = payeAmount + ssnAmount;
    const lines = buildGambiaStatutoryDeductionLines(grossSalary, gambiaSsnFundingMode);
    const existingTotal = Number(structure.totalDeductions) || 0;
    const totalDeductions = existingTotal + statutoryTotal;
    const netSalary = Math.max(0, grossSalary - totalDeductions);
    return {
        ...structure,
        deductions: [...(structure.deductions || []), ...lines],
        totalDeductions,
        netSalary,
    };
}

/**
 * Resolve formula from a calculation rule by id (when client sends calculationRuleId instead of formulaExpression).
 * @returns {Promise<string|null>} Formula string or null
 */
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

function findDuplicateTypeIds(items, key) {
    if (!Array.isArray(items)) return [];
    const seen = new Set();
    const duplicates = new Set();
    for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const raw = item[key];
        const id = raw == null ? "" : String(raw).trim();
        if (!id) continue;
        if (seen.has(id)) duplicates.add(id);
        else seen.add(id);
    }
    return Array.from(duplicates);
}

/**
 * Employee self-service: Get my current (active) salary structure
 */
export const getMySalaryStructure = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const today = new Date();
        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                userId,
                tenantId,
                effectiveDate: { lte: today },
                OR: [
                    { endDate: null },
                    { endDate: { gte: today } },
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
            logger.warn(`No active salary structure found for user: ${userId}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "No active salary structure found",
            });
        }

        logger.info(`Employee ${userId} retrieved their salary structure`);

        const data = await enrichWithNetAndTotalDeductions(salaryStructure, tenantId);
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { gambiaStatutoryEnabled: true, gambiaSsnFundingMode: true },
        });
        const dataWithGambia = appendGambiaStatutoryDeductionsIfEnabled(
            data,
            tenant?.gambiaStatutoryEnabled ?? false,
            tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE"
        );
        return res.status(200).json({
            success: true,
            data: dataWithGambia,
        });
    } catch (error) {
        logger.error(`Error fetching my salary structure: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch salary structure",
        });
    }
};

/**
 * Employee self-service: Get all my salary structures (history)
 */
export const getMySalaryStructures = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const salaryStructures = await prisma.salaryStructure.findMany({
            where: {
                userId,
                tenantId,
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

        logger.info(`Employee ${userId} retrieved ${salaryStructures.length} salary structures`);

        const data = await Promise.all(
            salaryStructures.map((s) => enrichWithNetAndTotalDeductions(s, tenantId))
        );
        return res.status(200).json({
            success: true,
            data,
            count: data.length,
        });
    } catch (error) {
        logger.error(`Error fetching my salary structures: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch salary structures",
        });
    }
};

/**
 * HR view: Get a specific employee's current (active) salary structure
 * Access: HR_ADMIN, HR_STAFF only (enforced by route middleware)
 */
export const getEmployeeSalaryStructure = async (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const today = new Date();
        // Find active salary structure: effective date <= today AND (no end date OR end date >= today)
        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                userId: employeeId,
                tenantId,
                effectiveDate: {
                    lte: today,
                },
                OR: [
                    { endDate: null },
                    { endDate: { gte: today } },
                ],
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        image: true,
                        address: true,
                        department: {
                            select: { id: true, name: true },
                        },
                        position: {
                            select: { id: true, title: true },
                        },
                    },
                },
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
            logger.warn(`No active salary structure found for employee: ${employeeId}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "No active salary structure found for this employee",
            });
        }

        logger.info(`HR retrieved salary structure for employee: ${employeeId}`);

        const data = await enrichWithNetAndTotalDeductions(salaryStructure, tenantId);
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { gambiaStatutoryEnabled: true, gambiaSsnFundingMode: true },
        });
        const dataWithGambia = appendGambiaStatutoryDeductionsIfEnabled(
            data,
            tenant?.gambiaStatutoryEnabled ?? false,
            tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE"
        );
        return res.status(200).json({
            success: true,
            data: dataWithGambia,
        });
    } catch (error) {
        logger.error(`Error fetching salary structure: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch salary structure",
        });
    }
};

/**
 * HR view: Get all salary structures for the tenant (optionally filtered by employee).
 * Enables the Salary Structures setup tab to show one list without "pick employee first".
 * Access: HR_ADMIN, HR_STAFF only (enforced by route middleware)
 */
export const getAllSalaryStructures = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { employeeId } = req.query;

        const where = {
            tenantId,
            ...(employeeId && { userId: employeeId }),
        };

        const salaryStructures = await prisma.salaryStructure.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        image: true,
                        address: true,
                        department: {
                            select: { id: true, name: true },
                        },
                        position: {
                            select: { id: true, title: true },
                        },
                    },
                },
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
            orderBy: { effectiveDate: "desc" },
        });

        logger.info(`Retrieved ${salaryStructures.length} salary structures for tenant ${tenantId}${employeeId ? ` (employee: ${employeeId})` : ""}`);

        const enriched = await Promise.all(
            salaryStructures.map((s) => enrichWithNetAndTotalDeductions(s, tenantId))
        );
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { gambiaStatutoryEnabled: true, gambiaSsnFundingMode: true },
        });
        const gambiaEnabled = tenant?.gambiaStatutoryEnabled ?? false;
        const gambiaMode = tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE";
        const data = enriched.map((s) => appendGambiaStatutoryDeductionsIfEnabled(s, gambiaEnabled, gambiaMode));
        return res.status(200).json({
            success: true,
            data,
            count: data.length,
        });
    } catch (error) {
        logger.error(`Error fetching all salary structures: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch salary structures",
        });
    }
};

/**
 * HR view: Get all salary structures for a specific employee (history)
 * Access: HR_ADMIN, HR_STAFF only (enforced by route middleware)
 */
export const getEmployeeSalaryStructures = async (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const salaryStructures = await prisma.salaryStructure.findMany({
            where: {
                userId: employeeId,
                tenantId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        image: true,
                        address: true,
                        department: {
                            select: { id: true, name: true },
                        },
                        position: {
                            select: { id: true, title: true },
                        },
                    },
                },
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

        logger.info(`HR retrieved ${salaryStructures.length} salary structures for employee: ${employeeId}`);

        const enriched = await Promise.all(
            salaryStructures.map((s) => enrichWithNetAndTotalDeductions(s, tenantId))
        );
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { gambiaStatutoryEnabled: true, gambiaSsnFundingMode: true },
        });
        const gambiaEnabled = tenant?.gambiaStatutoryEnabled ?? false;
        const gambiaMode = tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE";
        const data = enriched.map((s) => appendGambiaStatutoryDeductionsIfEnabled(s, gambiaEnabled, gambiaMode));
        return res.status(200).json({
            success: true,
            data,
            count: data.length,
        });
    } catch (error) {
        logger.error(`Error fetching salary structures: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch salary structures",
        });
    }
};

export const createSalaryStructure = async (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { baseSalary, salaryPeriodType, effectiveDate, endDate, currency, allowances, deductions } = req.body;

        const duplicateAllowanceTypeIds = findDuplicateTypeIds(allowances, "allowanceTypeId");
        if (duplicateAllowanceTypeIds.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Duplicate allowance types are not allowed in a salary structure",
                data: { duplicateAllowanceTypeIds },
            });
        }
        const duplicateDeductionTypeIds = findDuplicateTypeIds(deductions, "deductionTypeId");
        if (duplicateDeductionTypeIds.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Duplicate deduction types are not allowed in a salary structure",
                data: { duplicateDeductionTypeIds },
            });
        }

        if (!baseSalary || !effectiveDate) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Base salary and effective date are required",
            });
        }

        const employee = await prisma.user.findFirst({
            where: {
                id: employeeId,
                tenantId,
                isDeleted: false,
            },
            select: {
                id: true,
                departmentId: true,
                positionId: true,
                employmentType: true,
                status: true,
                hireDate: true,
            },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Build employee context for conditional calculations
        const employeeContext = {
            departmentId: employee.departmentId,
            positionId: employee.positionId,
            employmentType: employee.employmentType,
            baseSalary: baseSalary,
            status: employee.status,
            hireDate: employee.hireDate,
        };

        const validPeriodTypes = ["MONTHLY", "ANNUAL"];
        const periodType =
          salaryPeriodType != null && validPeriodTypes.includes(String(salaryPeriodType).toUpperCase())
            ? String(salaryPeriodType).toUpperCase()
            : "MONTHLY";

        const today = new Date();
        const effective = new Date(effectiveDate);
        const end = endDate ? new Date(endDate) : null;

        // Business rule: End date must be after effective date
        if (end && end <= effective) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "End date must be after effective date",
            });
        }

        // Business rule: Only one active salary structure per employee
        // If creating a new active structure (no end date or end date in future),
        // first auto-end any currently active structure so the overlap check passes
        if (!end || end >= today) {
            const activeStructure = await prisma.salaryStructure.findFirst({
                where: {
                    userId: employeeId,
                    tenantId,
                    effectiveDate: { lte: today },
                    OR: [
                        { endDate: null },
                        { endDate: { gte: today } },
                    ],
                },
            });

            if (activeStructure) {
                const dayBeforeEffective = new Date(effective);
                dayBeforeEffective.setDate(dayBeforeEffective.getDate() - 1);
                dayBeforeEffective.setHours(23, 59, 59, 999);
                await prisma.salaryStructure.update({
                    where: { id: activeStructure.id },
                    data: {
                        endDate: dayBeforeEffective,
                    },
                });
            }
        }

        // Business rule: Prevent overlapping salary structure periods
        // Check if new structure dates overlap with any existing structure
        const overlapping = await prisma.salaryStructure.findFirst({
            where: {
                userId: employeeId,
                tenantId,
                effectiveDate: {
                    lte: end ? end : new Date("2099-12-31"),
                },
                OR: [
                    { endDate: null },
                    { endDate: { gte: effective } },
                ],
            },
        });

        if (overlapping) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Salary structure dates overlap with existing structure",
                data: {
                    conflictingStructure: {
                        id: overlapping.id,
                        effectiveDate: overlapping.effectiveDate,
                        endDate: overlapping.endDate,
                    },
                },
            });
        }

        // Calculate initial gross salary (without deductions for now)
        // Will recalculate after all allowances and deductions are added
        const { grossSalary } = await recalculateSalary(
            baseSalary,
            allowances || [],
            [],
            employeeContext,
            tenantId
        );

        const salaryStructure = await prisma.salaryStructure.create({
            data: {
                tenantId,
                userId: employeeId,
                baseSalary,
                grossSalary,
                salaryPeriodType: periodType,
                effectiveDate: effective,
                endDate: end,
                currency: currency || "USD",
            },
        });

        if (allowances && allowances.length > 0) {
            for (const allowance of allowances) {
                const method = allowance.calculationMethod || "FIXED";
                let formulaExpression = allowance.formulaExpression?.trim() || null;
                const calculationRuleId = allowance.calculationRuleId || null;
                if (method === "FORMULA") {
                    if (!formulaExpression && calculationRuleId) {
                        formulaExpression = await getFormulaFromRuleId(calculationRuleId, tenantId);
                    }
                    if (!formulaExpression) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA for allowances",
                        });
                    }
                    const validation = validateFormula(formulaExpression);
                    if (!validation.valid) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: `Invalid allowance formula: ${validation.error}`,
                        });
                    }
                }
                const amountPeriodType = method === "FIXED" && (allowance.amountPeriodType === "ANNUAL" || allowance.amountPeriodType === "MONTHLY")
                    ? allowance.amountPeriodType
                    : "MONTHLY";
                await prisma.allowance.create({
                    data: {
                        salaryStructureId: salaryStructure.id,
                        allowanceTypeId: allowance.allowanceTypeId,
                        amount: method === "FORMULA" ? 0 : (allowance.amount ?? 0),
                        amountPeriodType,
                        calculationMethod: method,
                        formulaExpression: method === "FORMULA" ? formulaExpression : null,
                        calculationRuleId: method === "FORMULA" ? calculationRuleId : null,
                    },
                });
            }
        }

        if (deductions && deductions.length > 0) {
            for (const deduction of deductions) {
                const method = deduction.calculationMethod || "FIXED";
                let formulaExpression = deduction.formulaExpression?.trim() || null;
                const calculationRuleId = deduction.calculationRuleId || null;
                if (method === "FORMULA") {
                    if (!formulaExpression && calculationRuleId) {
                        formulaExpression = await getFormulaFromRuleId(calculationRuleId, tenantId);
                    }
                    if (!formulaExpression) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA for deductions",
                        });
                    }
                    const validation = validateFormula(formulaExpression);
                    if (!validation.valid) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: `Invalid deduction formula: ${validation.error}`,
                        });
                    }
                }
                const amountPeriodType = method === "FIXED" && (deduction.amountPeriodType === "ANNUAL" || deduction.amountPeriodType === "MONTHLY")
                    ? deduction.amountPeriodType
                    : "MONTHLY";
                await prisma.deduction.create({
                    data: {
                        salaryStructureId: salaryStructure.id,
                        deductionTypeId: deduction.deductionTypeId,
                        amount: method === "FORMULA" ? 0 : (deduction.amount ?? 0),
                        amountPeriodType,
                        calculationMethod: method,
                        formulaExpression: method === "FORMULA" ? formulaExpression : null,
                        calculationRuleId: method === "FORMULA" ? calculationRuleId : null,
                    },
                });
            }
        }

        const updatedStructure = await prisma.salaryStructure.findUnique({
            where: { id: salaryStructure.id },
            include: {
                allowances: {
                    include: {
                        allowanceType: true,
                    },
                },
                deductions: {
                    include: {
                        deductionType: true,
                    },
                },
            },
        });

        // Recalculate with all allowances and deductions now that they're saved
        // This ensures gross salary accounts for all percentage-based calculations
        const { grossSalary: finalGross, netSalary, totalDeductions } = await recalculateSalary(
            updatedStructure.baseSalary,
            updatedStructure.allowances,
            updatedStructure.deductions,
            employeeContext,
            tenantId
        );

        // Update with final calculated gross salary
        const finalStructure = await prisma.salaryStructure.update({
            where: { id: salaryStructure.id },
            data: {
                grossSalary: finalGross,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        address: true,
                    },
                },
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
        });

        logger.info(`Created salary structure with ID: ${salaryStructure.id} for employee: ${employeeId}`);
        const changes = {
            baseSalary: { before: null, after: finalStructure.baseSalary },
            grossSalary: { before: null, after: finalStructure.grossSalary },
            effectiveDate: { before: null, after: finalStructure.effectiveDate },
            endDate: { before: null, after: finalStructure.endDate },
            currency: { before: null, after: finalStructure.currency },
        };
        await addLog(userId, tenantId, "CREATE", "SalaryStructure", finalStructure.id, changes, req);

        const data = { ...finalStructure, netSalary, totalDeductions };
        return res.status(201).json({
            success: true,
            data,
            message: "Salary structure created successfully",
        });
    } catch (error) {
        logger.error(`Error creating salary structure: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create salary structure",
        });
    }
};

export const updateSalaryStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { baseSalary, salaryPeriodType, effectiveDate, endDate, currency, allowances, deductions } = req.body;

        const duplicateAllowanceTypeIds = findDuplicateTypeIds(allowances, "allowanceTypeId");
        if (duplicateAllowanceTypeIds.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Duplicate allowance types are not allowed in a salary structure",
                data: { duplicateAllowanceTypeIds },
            });
        }
        const duplicateDeductionTypeIds = findDuplicateTypeIds(deductions, "deductionTypeId");
        if (duplicateDeductionTypeIds.length > 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Duplicate deduction types are not allowed in a salary structure",
                data: { duplicateDeductionTypeIds },
            });
        }

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                allowances: {
                    include: {
                        allowanceType: true,
                    },
                },
                deductions: {
                    include: {
                        deductionType: true,
                    },
                },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        const validPeriodTypes = ["MONTHLY", "ANNUAL"];
        const updateData = {};
        if (baseSalary !== undefined) updateData.baseSalary = baseSalary;
        if (salaryPeriodType !== undefined) {
            updateData.salaryPeriodType = validPeriodTypes.includes(String(salaryPeriodType).toUpperCase())
                ? String(salaryPeriodType).toUpperCase()
                : salaryStructure.salaryPeriodType ?? "MONTHLY";
        }
        if (effectiveDate !== undefined) updateData.effectiveDate = new Date(effectiveDate);
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
        if (currency !== undefined) updateData.currency = currency;

        const hasAllowances = Array.isArray(allowances);
        const hasDeductions = Array.isArray(deductions);
        if (Object.keys(updateData).length === 0 && !hasAllowances && !hasDeductions) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        // Apply base structure update first
        const baseToUse = baseSalary !== undefined ? baseSalary : salaryStructure.baseSalary;
        if (Object.keys(updateData).length > 0) {
            await prisma.salaryStructure.update({
                where: { id },
                data: updateData,
            });
        }

        // Replace allowances if provided (full replace: delete existing, create new)
        if (hasAllowances) {
            await prisma.allowance.deleteMany({ where: { salaryStructureId: id } });
            for (const allowance of allowances) {
                const method = allowance.calculationMethod || "FIXED";
                let formulaExpression = allowance.formulaExpression?.trim() || null;
                const calculationRuleId = allowance.calculationRuleId || null;
                if (method === "FORMULA") {
                    if (!formulaExpression && calculationRuleId) {
                        formulaExpression = await getFormulaFromRuleId(calculationRuleId, tenantId);
                    }
                    if (!formulaExpression) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA for allowances",
                        });
                    }
                    const validation = validateFormula(formulaExpression);
                    if (!validation.valid) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: `Invalid allowance formula: ${validation.error}`,
                        });
                    }
                }
                const amountPeriodType = method === "FIXED" && (allowance.amountPeriodType === "ANNUAL" || allowance.amountPeriodType === "MONTHLY")
                    ? allowance.amountPeriodType
                    : "MONTHLY";
                await prisma.allowance.create({
                    data: {
                        salaryStructureId: id,
                        allowanceTypeId: allowance.allowanceTypeId,
                        amount: method === "FORMULA" ? 0 : (allowance.amount ?? 0),
                        amountPeriodType,
                        calculationMethod: method,
                        formulaExpression: method === "FORMULA" ? formulaExpression : null,
                        calculationRuleId: method === "FORMULA" ? calculationRuleId : null,
                    },
                });
            }
        }

        // Replace deductions if provided (full replace: delete existing, create new)
        if (hasDeductions) {
            await prisma.deduction.deleteMany({ where: { salaryStructureId: id } });
            for (const deduction of deductions) {
                const method = deduction.calculationMethod || "FIXED";
                let formulaExpression = deduction.formulaExpression?.trim() || null;
                const calculationRuleId = deduction.calculationRuleId || null;
                if (method === "FORMULA") {
                    if (!formulaExpression && calculationRuleId) {
                        formulaExpression = await getFormulaFromRuleId(calculationRuleId, tenantId);
                    }
                    if (!formulaExpression) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA for deductions",
                        });
                    }
                    const validation = validateFormula(formulaExpression);
                    if (!validation.valid) {
                        return res.status(400).json({
                            success: false,
                            error: "Bad Request",
                            message: `Invalid deduction formula: ${validation.error}`,
                        });
                    }
                }
                const amountPeriodType = method === "FIXED" && (deduction.amountPeriodType === "ANNUAL" || deduction.amountPeriodType === "MONTHLY")
                    ? deduction.amountPeriodType
                    : "MONTHLY";
                await prisma.deduction.create({
                    data: {
                        salaryStructureId: id,
                        deductionTypeId: deduction.deductionTypeId,
                        amount: method === "FORMULA" ? 0 : (deduction.amount ?? 0),
                        amountPeriodType,
                        calculationMethod: method,
                        formulaExpression: method === "FORMULA" ? formulaExpression : null,
                        calculationRuleId: method === "FORMULA" ? calculationRuleId : null,
                    },
                });
            }
        }

        // Fetch current state and recalculate gross salary
        const currentStructure = await prisma.salaryStructure.findFirst({
            where: { id, tenantId },
            include: {
                allowances: { include: { allowanceType: true } },
                deductions: { include: { deductionType: true } },
            },
        });
        if (!currentStructure) {
            return res.status(404).json({ success: false, error: "Not Found", message: "Salary structure not found" });
        }

        const employee = await prisma.user.findFirst({
            where: { id: salaryStructure.userId, tenantId, isDeleted: false },
            select: { departmentId: true, positionId: true, employmentType: true, status: true, hireDate: true },
        });
        const employeeContext = employee
            ? {
                departmentId: employee.departmentId,
                positionId: employee.positionId,
                employmentType: employee.employmentType,
                baseSalary: Number(baseToUse),
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

        const updated = await prisma.salaryStructure.update({
            where: { id },
            data: { grossSalary },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        address: true,
                        image: true,
                        department: { select: { id: true, name: true } },
                        position: { select: { id: true, title: true } },
                    },
                },
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
        });

        logger.info(`Updated salary structure with ID: ${id}`);
        const changes = getChangesDiff(salaryStructure, updated);
        await addLog(userId, tenantId, "UPDATE", "SalaryStructure", id, changes, req);

        const data = await enrichWithNetAndTotalDeductions(updated, tenantId);
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { gambiaStatutoryEnabled: true, gambiaSsnFundingMode: true },
        });
        const dataWithGambia = appendGambiaStatutoryDeductionsIfEnabled(
            data,
            tenant?.gambiaStatutoryEnabled ?? false,
            tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE"
        );
        return res.status(200).json({
            success: true,
            data: dataWithGambia,
            message: "Salary structure updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating salary structure: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update salary structure",
        });
    }
};

/**
 * Deactivate a salary structure (soft end). Sets endDate to yesterday so it no longer overlaps.
 */
export const deactivateSalaryStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: { id, tenantId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        address: true,
                        image: true,
                        department: { select: { id: true, name: true } },
                        position: { select: { id: true, title: true } },
                    },
                },
                allowances: {
                    include: {
                        allowanceType: {
                            select: { id: true, name: true, code: true, isTaxable: true },
                        },
                    },
                },
                deductions: {
                    include: {
                        deductionType: {
                            select: { id: true, name: true, code: true, isStatutory: true },
                        },
                    },
                },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        const today = new Date();
        const isActive = !salaryStructure.endDate || new Date(salaryStructure.endDate) >= today;
        if (!isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Salary structure is already inactive",
            });
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(23, 59, 59, 999);
        const updated = await prisma.salaryStructure.update({
            where: { id },
            data: { endDate: yesterday },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        address: true,
                        image: true,
                        department: { select: { id: true, name: true } },
                        position: { select: { id: true, title: true } },
                    },
                },
                allowances: {
                    include: {
                        allowanceType: {
                            select: { id: true, name: true, code: true, isTaxable: true },
                        },
                    },
                },
                deductions: {
                    include: {
                        deductionType: {
                            select: { id: true, name: true, code: true, isStatutory: true },
                        },
                    },
                },
            },
        });

        const enriched = await enrichWithNetAndTotalDeductions(updated, tenantId);
        logger.info(`Deactivated salary structure with ID: ${id}`);
        const changes = getChangesDiff(salaryStructure, updated);
        await addLog(userId, tenantId, "UPDATE", "SalaryStructure", id, changes, req);

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { gambiaStatutoryEnabled: true, gambiaSsnFundingMode: true },
        });
        const dataWithGambia = appendGambiaStatutoryDeductionsIfEnabled(
            enriched,
            tenant?.gambiaStatutoryEnabled ?? false,
            tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE"
        );
        return res.status(200).json({
            success: true,
            data: dataWithGambia,
            message: "Salary structure ended successfully",
        });
    } catch (error) {
        logger.error(`Error deactivating salary structure: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to end salary structure",
        });
    }
};

/**
 * Activate a salary structure (reopen). Sets endDate to null. Fails if dates would overlap with another structure.
 */
export const activateSalaryStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: { id, tenantId },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        address: true,
                        image: true,
                        department: { select: { id: true, name: true } },
                        position: { select: { id: true, title: true } },
                    },
                },
                allowances: {
                    include: {
                        allowanceType: {
                            select: { id: true, name: true, code: true, isTaxable: true },
                        },
                    },
                },
                deductions: {
                    include: {
                        deductionType: {
                            select: { id: true, name: true, code: true, isStatutory: true },
                        },
                    },
                },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        const today = new Date();
        const isActive = !salaryStructure.endDate || new Date(salaryStructure.endDate) >= today;
        if (isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Salary structure is already active",
            });
        }

        const effective = new Date(salaryStructure.effectiveDate);
        // Check overlap with other structures (excluding this one)
        const overlapping = await prisma.salaryStructure.findFirst({
            where: {
                userId: salaryStructure.userId,
                tenantId,
                id: { not: id },
                effectiveDate: { lte: new Date("2099-12-31") },
                OR: [
                    { endDate: null },
                    { endDate: { gte: effective } },
                ],
            },
        });

        if (overlapping) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Reactivating would overlap with existing structure",
                data: {
                    conflictingStructure: {
                        id: overlapping.id,
                        effectiveDate: overlapping.effectiveDate,
                        endDate: overlapping.endDate,
                    },
                },
            });
        }

        const updated = await prisma.salaryStructure.update({
            where: { id },
            data: { endDate: null },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        address: true,
                        image: true,
                        department: { select: { id: true, name: true } },
                        position: { select: { id: true, title: true } },
                    },
                },
                allowances: {
                    include: {
                        allowanceType: {
                            select: { id: true, name: true, code: true, isTaxable: true },
                        },
                    },
                },
                deductions: {
                    include: {
                        deductionType: {
                            select: { id: true, name: true, code: true, isStatutory: true },
                        },
                    },
                },
            },
        });

        const enriched = await enrichWithNetAndTotalDeductions(updated, tenantId);
        logger.info(`Activated salary structure with ID: ${id}`);
        const changes = getChangesDiff(salaryStructure, updated);
        await addLog(userId, tenantId, "UPDATE", "SalaryStructure", id, changes, req);

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { gambiaStatutoryEnabled: true, gambiaSsnFundingMode: true },
        });
        const dataWithGambia = appendGambiaStatutoryDeductionsIfEnabled(
            enriched,
            tenant?.gambiaStatutoryEnabled ?? false,
            tenant?.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE"
        );
        return res.status(200).json({
            success: true,
            data: dataWithGambia,
            message: "Salary structure reactivated successfully",
        });
    } catch (error) {
        logger.error(`Error activating salary structure: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to reactivate salary structure",
        });
    }
};

/**
 * Permanently delete a salary structure (admin cleanup).
 * Restricted to HR_ADMIN. Only allowed when structure is inactive.
 * Audit log is written BEFORE the delete for enterprise compliance.
 */
export const deleteSalaryStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: { id, tenantId },
            include: {
                user: { select: { name: true, employeeId: true, email: true, address: true, image: true } },
                allowances: { select: { id: true } },
                deductions: { select: { id: true } },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        const today = new Date();
        const isActive = !salaryStructure.endDate || new Date(salaryStructure.endDate) >= today;
        if (isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete an active salary structure. Deactivate it first, then delete.",
            });
        }

        // Audit log BEFORE delete (enterprise requirement: log before destructive action)
        const auditPayload = {
            deleted: true,
            deletedAt: new Date().toISOString(),
            structureSummary: {
                id,
                userId: salaryStructure.userId,
                employeeName: salaryStructure.user?.name,
                employeeId: salaryStructure.user?.employeeId,
                baseSalary: salaryStructure.baseSalary,
                effectiveDate: salaryStructure.effectiveDate,
                endDate: salaryStructure.endDate,
                allowanceCount: salaryStructure.allowances?.length ?? 0,
                deductionCount: salaryStructure.deductions?.length ?? 0,
            },
        };
        await addLog(userId, tenantId, "DELETE", "SalaryStructure", id, auditPayload, req);

        await prisma.salaryStructure.delete({ where: { id } });

        logger.info(`Permanently deleted salary structure with ID: ${id} by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: { id },
            message: "Salary structure permanently deleted",
        });
    } catch (error) {
        logger.error(`Error deleting salary structure: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete salary structure",
        });
    }
};

export const addAllowanceToStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { allowanceTypeId, amount, calculationMethod, formulaExpression, calculationRuleId } = req.body;

        const method = calculationMethod || "FIXED";
        if (!allowanceTypeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Allowance type ID is required",
            });
        }
        if (method !== "FORMULA" && amount === undefined) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Amount is required when calculation method is not FORMULA",
            });
        }
        let resolvedFormula = formulaExpression?.trim() || null;
        if (method === "FORMULA") {
            if (!resolvedFormula && calculationRuleId) {
                resolvedFormula = await getFormulaFromRuleId(calculationRuleId, tenantId);
            }
            if (!resolvedFormula) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA",
                });
            }
            const validation = validateFormula(resolvedFormula);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Invalid formula: ${validation.error}`,
                });
            }
        }

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        departmentId: true,
                        positionId: true,
                        employmentType: true,
                        status: true,
                        hireDate: true,
                    },
                },
                allowances: {
                    include: {
                        allowanceType: true,
                    },
                },
                deductions: {
                    include: {
                        deductionType: true,
                    },
                },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        // Build employee context for conditional calculations
        const employeeContext = {
            departmentId: salaryStructure.user?.departmentId,
            positionId: salaryStructure.user?.positionId,
            employmentType: salaryStructure.user?.employmentType,
            baseSalary: salaryStructure.baseSalary,
            status: salaryStructure.user?.status,
            hireDate: salaryStructure.user?.hireDate,
        };

        const allowanceType = await prisma.allowanceType.findFirst({
            where: {
                id: allowanceTypeId,
                tenantId,
                deletedAt: null,
            },
        });

        if (!allowanceType) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance type not found",
            });
        }

        const existingAllowance = await prisma.allowance.findFirst({
            where: { salaryStructureId: id, allowanceTypeId },
            select: { id: true },
        });
        if (existingAllowance) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "This allowance type already exists on the salary structure",
            });
        }

        const allowance = await prisma.allowance.create({
            data: {
                salaryStructureId: id,
                allowanceTypeId,
                amount: method === "FORMULA" ? 0 : (amount ?? 0),
                calculationMethod: method,
                formulaExpression: method === "FORMULA" ? resolvedFormula : null,
                calculationRuleId: method === "FORMULA" ? (calculationRuleId || null) : null,
            },
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
        });

        // Recalculate gross salary with new allowance included
        const updatedAllowances = [...salaryStructure.allowances, allowance];
        const { grossSalary } = await recalculateSalary(
            salaryStructure.baseSalary,
            updatedAllowances,
            salaryStructure.deductions,
            employeeContext,
            tenantId
        );

        await prisma.salaryStructure.update({
            where: { id },
            data: { grossSalary },
        });

        logger.info(`Added allowance to salary structure: ${id}`);
        const changes = {
            allowance: {
                before: null,
                after: {
                    id: allowance.id,
                    allowanceTypeId: allowance.allowanceTypeId,
                    amount: allowance.amount,
                    calculationMethod: allowance.calculationMethod,
                },
            },
        };
        await addLog(userId, tenantId, "ADD_ALLOWANCE", "SalaryStructure", id, changes, req);

        return res.status(201).json({
            success: true,
            data: allowance,
            message: "Allowance added successfully",
        });
    } catch (error) {
        logger.error(`Error adding allowance: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to add allowance",
        });
    }
};

export const removeAllowanceFromStructure = async (req, res) => {
    try {
        const { id, allowanceId } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        departmentId: true,
                        positionId: true,
                        employmentType: true,
                        status: true,
                        hireDate: true,
                    },
                },
                allowances: {
                    include: {
                        allowanceType: true,
                    },
                },
                deductions: {
                    include: {
                        deductionType: true,
                    },
                },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        // Build employee context for conditional calculations
        const employeeContext = {
            departmentId: salaryStructure.user?.departmentId,
            positionId: salaryStructure.user?.positionId,
            employmentType: salaryStructure.user?.employmentType,
            baseSalary: salaryStructure.baseSalary,
            status: salaryStructure.user?.status,
            hireDate: salaryStructure.user?.hireDate,
        };

        const allowance = await prisma.allowance.findFirst({
            where: {
                id: allowanceId,
                salaryStructureId: id,
            },
        });

        if (!allowance) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance not found",
            });
        }

        await prisma.allowance.delete({
            where: { id: allowanceId },
        });

        const updatedAllowances = salaryStructure.allowances.filter(a => a.id !== allowanceId);
        const { grossSalary } = await recalculateSalary(
            salaryStructure.baseSalary,
            updatedAllowances,
            salaryStructure.deductions,
            employeeContext,
            tenantId
        );

        await prisma.salaryStructure.update({
            where: { id },
            data: { grossSalary },
        });

        logger.info(`Removed allowance from salary structure: ${id}`);
        const changes = {
            allowance: {
                before: {
                    id: allowance.id,
                    allowanceTypeId: allowance.allowanceTypeId,
                    amount: allowance.amount,
                    calculationMethod: allowance.calculationMethod,
                },
                after: null,
            },
        };
        await addLog(userId, tenantId, "REMOVE_ALLOWANCE", "SalaryStructureAllowance", allowance.id, changes, req);

        return res.status(200).json({
            success: true,
            message: "Allowance removed successfully",
        });
    } catch (error) {
        logger.error(`Error removing allowance: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to remove allowance",
        });
    }
};

export const addDeductionToStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { deductionTypeId, amount, calculationMethod, formulaExpression, calculationRuleId } = req.body;

        const method = calculationMethod || "FIXED";
        if (!deductionTypeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Deduction type ID is required",
            });
        }
        if (method !== "FORMULA" && amount === undefined) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Amount is required when calculation method is not FORMULA",
            });
        }
        let resolvedFormula = formulaExpression?.trim() || null;
        if (method === "FORMULA") {
            if (!resolvedFormula && calculationRuleId) {
                resolvedFormula = await getFormulaFromRuleId(calculationRuleId, tenantId);
            }
            if (!resolvedFormula) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "formulaExpression or calculationRuleId is required when calculationMethod is FORMULA",
                });
            }
            const validation = validateFormula(resolvedFormula);
            if (!validation.valid) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Invalid formula: ${validation.error}`,
                });
            }
        }

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        departmentId: true,
                        positionId: true,
                        employmentType: true,
                        status: true,
                        hireDate: true,
                    },
                },
                allowances: {
                    include: {
                        allowanceType: true,
                    },
                },
                deductions: {
                    include: {
                        deductionType: true,
                    },
                },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        // Build employee context for conditional calculations
        const employeeContext = {
            departmentId: salaryStructure.user?.departmentId,
            positionId: salaryStructure.user?.positionId,
            employmentType: salaryStructure.user?.employmentType,
            baseSalary: salaryStructure.baseSalary,
            status: salaryStructure.user?.status,
            hireDate: salaryStructure.user?.hireDate,
        };

        const deductionType = await prisma.deductionType.findFirst({
            where: {
                id: deductionTypeId,
                tenantId,
                deletedAt: null,
            },
        });

        if (!deductionType) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction type not found",
            });
        }

        const existingDeduction = await prisma.deduction.findFirst({
            where: { salaryStructureId: id, deductionTypeId },
            select: { id: true },
        });
        if (existingDeduction) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "This deduction type already exists on the salary structure",
            });
        }

        const deduction = await prisma.deduction.create({
            data: {
                salaryStructureId: id,
                deductionTypeId,
                amount: method === "FORMULA" ? 0 : (amount ?? 0),
                calculationMethod: method,
                formulaExpression: method === "FORMULA" ? resolvedFormula : null,
                calculationRuleId: method === "FORMULA" ? (calculationRuleId || null) : null,
            },
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
        });

        // Recalculate gross salary (deductions don't affect gross, but we recalculate for consistency)
        // This ensures the structure is always in sync with its components
        const updatedDeductions = [...salaryStructure.deductions, deduction];
        const { grossSalary } = await recalculateSalary(
            salaryStructure.baseSalary,
            salaryStructure.allowances,
            updatedDeductions,
            employeeContext,
            tenantId
        );

        await prisma.salaryStructure.update({
            where: { id },
            data: { grossSalary },
        });

        logger.info(`Added deduction to salary structure: ${id}`);
        const changes = {
            deduction: {
                before: null,
                after: {
                    id: deduction.id,
                    deductionTypeId: deduction.deductionTypeId,
                    amount: deduction.amount,
                    calculationMethod: deduction.calculationMethod,
                },
            },
        };
        await addLog(userId, tenantId, "ADD_DEDUCTION", "SalaryStructureDeduction", deduction.id, changes, req);

        return res.status(201).json({
            success: true,
            data: deduction,
            message: "Deduction added successfully",
        });
    } catch (error) {
        logger.error(`Error adding deduction: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to add deduction",
        });
    }
};

export const removeDeductionFromStructure = async (req, res) => {
    try {
        const { id, deductionId } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        departmentId: true,
                        positionId: true,
                        employmentType: true,
                        status: true,
                        hireDate: true,
                    },
                },
                allowances: {
                    include: {
                        allowanceType: true,
                    },
                },
                deductions: {
                    include: {
                        deductionType: true,
                    },
                },
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        // Build employee context for conditional calculations
        const employeeContext = {
            departmentId: salaryStructure.user?.departmentId,
            positionId: salaryStructure.user?.positionId,
            employmentType: salaryStructure.user?.employmentType,
            baseSalary: salaryStructure.baseSalary,
            status: salaryStructure.user?.status,
            hireDate: salaryStructure.user?.hireDate,
        };

        const deduction = await prisma.deduction.findFirst({
            where: {
                id: deductionId,
                salaryStructureId: id,
            },
        });

        if (!deduction) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction not found",
            });
        }

        await prisma.deduction.delete({
            where: { id: deductionId },
        });

        const updatedDeductions = salaryStructure.deductions.filter(d => d.id !== deductionId);
        const { grossSalary } = await recalculateSalary(
            salaryStructure.baseSalary,
            salaryStructure.allowances,
            updatedDeductions,
            employeeContext,
            tenantId
        );

        await prisma.salaryStructure.update({
            where: { id },
            data: { grossSalary },
        });

        logger.info(`Removed deduction from salary structure: ${id}`);
        const changes = {
            deduction: {
                before: {
                    id: deduction.id,
                    deductionTypeId: deduction.deductionTypeId,
                    amount: deduction.amount,
                    calculationMethod: deduction.calculationMethod,
                },
                after: null,
            },
        };
        await addLog(userId, tenantId, "REMOVE_DEDUCTION", "SalaryStructureDeduction", deduction.id, changes, req);

        return res.status(200).json({
            success: true,
            message: "Deduction removed successfully",
        });
    } catch (error) {
        logger.error(`Error removing deduction: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to remove deduction",
        });
    }
};

/**
 * For bulk allowance/deduction UI: who already has this type on their latest salary structure.
 * Query: exactly one of allowanceTypeId | deductionTypeId
 */
export const getLineCoverageForBulkAllocation = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        if (!tenantId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const allowanceTypeId = String(req.query.allowanceTypeId || "").trim();
        const deductionTypeId = String(req.query.deductionTypeId || "").trim();

        if ((allowanceTypeId && deductionTypeId) || (!allowanceTypeId && !deductionTypeId)) {
            return res.status(400).json({
                success: false,
                message: "Provide exactly one of allowanceTypeId or deductionTypeId",
            });
        }

        if (allowanceTypeId) {
            const t = await prisma.allowanceType.findFirst({
                where: { id: allowanceTypeId, tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!t) {
                return res.status(404).json({ success: false, message: "Allowance type not found" });
            }
            const byUserId = await mapLatestAllowanceLineByUser(tenantId, allowanceTypeId);
            return res.json({ success: true, data: { byUserId } });
        }

        const t = await prisma.deductionType.findFirst({
            where: { id: deductionTypeId, tenantId, deletedAt: null },
            select: { id: true },
        });
        if (!t) {
            return res.status(404).json({ success: false, message: "Deduction type not found" });
        }
        const byUserId = await mapLatestDeductionLineByUser(tenantId, deductionTypeId);
        return res.json({ success: true, data: { byUserId } });
    } catch (error) {
        logger.error(`getLineCoverageForBulkAllocation: ${error.message}`, { stack: error.stack });
        return res.status(500).json({ success: false, message: "Failed to load line coverage" });
    }
};

