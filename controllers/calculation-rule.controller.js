import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import {
    evaluateRules,
    calculateRuleAmount,
    clearRuleCache,
    getAvailableOperators,
    getCacheStats,
    validateConditionsFormat
} from "../services/rule-engine.service.js";
import {
    validateFormula,
    evaluateFormula,
    FORMULA_VARIABLES,
    getAvailableFunctions,
    getFormulaExamples,
    extractFormulaVariables,
} from "../services/formula-evaluator.service.js";
import { validateConditions, validateAction } from "../utils/rule-validation.utils.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

export const getAllCalculationRules = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { ruleType, isActive } = req.query;

        const where = {
            tenantId,
            deletedAt: null,
        };

        if (ruleType) {
            where.ruleType = ruleType;
        }

        if (isActive !== undefined) {
            where.isActive = isActive === "true";
        }

        const rules = await prisma.calculationRule.findMany({
            where,
            include: {
                allowanceType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                deductionType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
            orderBy: [
                { priority: "desc" },
                { createdAt: "desc" },
            ],
        });

        logger.info(`Retrieved ${rules.length} calculation rules`);

        return res.status(200).json({
            success: true,
            data: rules,
            count: rules.length,
        });
    } catch (error) {
        logger.error(`Error fetching calculation rules: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch calculation rules",
        });
    }
};

export const getCalculationRuleById = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const rule = await prisma.calculationRule.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
            include: {
                allowanceType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                deductionType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        if (!rule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Calculation rule not found",
            });
        }

        logger.info(`Retrieved calculation rule: ${id}`);

        return res.status(200).json({
            success: true,
            data: rule,
        });
    } catch (error) {
        logger.error(`Error fetching calculation rule: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch calculation rule",
        });
    }
};

export const createCalculationRule = async (req, res) => {
    try {
        const { id: userId, tenantId } = req.user;
        const { name, description, ruleType, allowanceTypeId, deductionTypeId, conditions, action, priority, isActive, effectiveDate, endDate } = req.body;

        if (!name || !ruleType || !conditions || !action || !effectiveDate) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Name, ruleType, conditions, action, and effectiveDate are required",
            });
        }

        if (ruleType === "ALLOWANCE" && !allowanceTypeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "allowanceTypeId is required for ALLOWANCE rule type",
            });
        }

        if (ruleType === "DEDUCTION" && !deductionTypeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "deductionTypeId is required for DEDUCTION rule type",
            });
        }

        // Validate conditions structure
        const conditionsValidation = validateConditions(conditions);
        if (!conditionsValidation.valid) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Invalid conditions: ${conditionsValidation.error}`,
            });
        }

        // Validate action structure
        const actionValidation = validateAction(action);
        if (!actionValidation.valid) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Invalid action: ${actionValidation.error}`,
            });
        }

        // Validate allowance/deduction type exists and belongs to tenant
        if (ruleType === "ALLOWANCE") {
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
        }

        if (ruleType === "DEDUCTION") {
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
        }

        const rule = await prisma.calculationRule.create({
            data: {
                tenantId,
                name,
                description,
                ruleType,
                allowanceTypeId: ruleType === "ALLOWANCE" ? allowanceTypeId : null,
                deductionTypeId: ruleType === "DEDUCTION" ? deductionTypeId : null,
                conditions,
                action,
                priority: priority || 0,
                isActive: isActive !== undefined ? isActive : true,
                effectiveDate: new Date(effectiveDate),
                endDate: endDate ? new Date(endDate) : null,
            },
            include: {
                allowanceType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                deductionType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        logger.info(`Created calculation rule: ${rule.id}`);

        // Clear rule cache for this tenant
        clearRuleCache(tenantId);

        const changes = {
            name: { before: null, after: rule.name },
            ruleType: { before: null, after: rule.ruleType },
            priority: { before: null, after: rule.priority },
            isActive: { before: null, after: rule.isActive },
            effectiveDate: { before: null, after: rule.effectiveDate },
            endDate: { before: null, after: rule.endDate },
        };
        await addLog(userId, tenantId, "CREATE", "CalculationRule", rule.id, changes, req);

        return res.status(201).json({
            success: true,
            data: rule,
            message: "Calculation rule created successfully",
        });
    } catch (error) {
        logger.error(`Error creating calculation rule: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create calculation rule",
        });
    }
};

export const updateCalculationRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;
        const { name, description, conditions, action, priority, isActive, effectiveDate, endDate } = req.body;

        const existingRule = await prisma.calculationRule.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
        });

        if (!existingRule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Calculation rule not found",
            });
        }

        const updateData = {};

        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (priority !== undefined) updateData.priority = priority;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (effectiveDate !== undefined) updateData.effectiveDate = new Date(effectiveDate);
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

        if (conditions !== undefined) {
            const conditionsValidation = validateConditions(conditions);
            if (!conditionsValidation.valid) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Invalid conditions: ${conditionsValidation.error}`,
                });
            }
            updateData.conditions = conditions;
        }

        if (action !== undefined) {
            const actionValidation = validateAction(action);
            if (!actionValidation.valid) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Invalid action: ${actionValidation.error}`,
                });
            }
            updateData.action = action;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        const updatedRule = await prisma.calculationRule.update({
            where: { id },
            data: updateData,
            include: {
                allowanceType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                deductionType: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        logger.info(`Updated calculation rule: ${id}`);

        // Clear rule cache for this tenant
        clearRuleCache(tenantId);

        const changes = getChangesDiff(existingRule, updatedRule);
        await addLog(userId, tenantId, "UPDATE", "CalculationRule", id, changes, req);

        return res.status(200).json({
            success: true,
            data: updatedRule,
            message: "Calculation rule updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating calculation rule: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update calculation rule",
        });
    }
};

/**
 * Activate a calculation rule. Dedicated endpoint for clear audit trail (ACTION: ACTIVATE).
 */
export const activateCalculationRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const existing = await prisma.calculationRule.findFirst({
            where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Calculation rule not found",
            });
        }

        if (existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Calculation rule is already active",
            });
        }

        const rule = await prisma.calculationRule.update({
            where: { id },
            data: { isActive: true },
        });

        await addLog(userId, tenantId, "ACTIVATE", "CalculationRule", id, { isActive: { before: false, after: true } }, req);
        clearRuleCache(tenantId);
        logger.info(`Calculation rule ${id} activated by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: rule,
            message: "Calculation rule activated successfully",
        });
    } catch (error) {
        logger.error(`Error activating calculation rule: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to activate calculation rule",
        });
    }
};

/**
 * Deactivate a calculation rule. Dedicated endpoint for clear audit trail (ACTION: DEACTIVATE).
 */
export const deactivateCalculationRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const existing = await prisma.calculationRule.findFirst({
            where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Calculation rule not found",
            });
        }

        if (!existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Calculation rule is already inactive",
            });
        }

        const rule = await prisma.calculationRule.update({
            where: { id },
            data: { isActive: false },
        });

        await addLog(userId, tenantId, "DEACTIVATE", "CalculationRule", id, { isActive: { before: true, after: false } }, req);
        clearRuleCache(tenantId);
        logger.info(`Calculation rule ${id} deactivated by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: rule,
            message: "Calculation rule deactivated successfully",
        });
    } catch (error) {
        logger.error(`Error deactivating calculation rule: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to deactivate calculation rule",
        });
    }
};

export const deleteCalculationRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const rule = await prisma.calculationRule.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
        });

        if (!rule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Calculation rule not found",
            });
        }

        const deleted = await prisma.calculationRule.update({
            where: { id },
            data: {
                deletedAt: new Date(),
            },
        });

        logger.info(`Soft deleted calculation rule with ID: ${id}`);

        // Clear rule cache for this tenant
        clearRuleCache(tenantId);

        const changes = getChangesDiff(rule, deleted);
        await addLog(userId, tenantId, "DELETE", "CalculationRule", id, changes, req);

        return res.status(200).json({
            success: true,
            data: deleted,
            message: "Calculation rule deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting calculation rule: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete calculation rule",
        });
    }
};

export const testCalculationRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;
        const { employeeContext, baseSalary, grossSalary } = req.body;

        if (!employeeContext) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "employeeContext is required",
            });
        }

        const rule = await prisma.calculationRule.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
        });

        if (!rule) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Calculation rule not found",
            });
        }

        // Evaluate the rule
        const typeId = rule.ruleType === "ALLOWANCE" ? rule.allowanceTypeId : rule.deductionTypeId;
        const matchingEvents = await evaluateRules(rule.ruleType, typeId, employeeContext, tenantId);

        // Check if this specific rule matched
        const ruleEvent = matchingEvents.find(e => e.params?.ruleId === id);
        const matches = !!ruleEvent;

        let calculatedAmount = 0;
        if (matches && ruleEvent) {
            calculatedAmount = await calculateRuleAmount(
                ruleEvent.params.action,
                employeeContext,
                baseSalary || 0,
                grossSalary || 0,
                {},
                tenantId
            );
        }

        logger.info(`Tested calculation rule: ${id}`, {
            matches,
            calculatedAmount,
        });

        const changes = {
            matches: { before: null, after: matches },
            calculatedAmount: { before: null, after: calculatedAmount },
        };
        await addLog(userId, tenantId, "READ", "CalculationRuleTest", id, changes, req);

        return res.status(200).json({
            success: true,
            data: {
                rule: {
                    id: rule.id,
                    name: rule.name,
                    ruleType: rule.ruleType,
                },
                matches,
                calculatedAmount,
                employeeContext,
            },
        });
    } catch (error) {
        logger.error(`Error testing calculation rule: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to test calculation rule",
        });
    }
};

/**
 * Get available operators for rule conditions
 */
export const getRuleOperators = async (req, res) => {
    try {
        const operators = getAvailableOperators();

        return res.status(200).json({
            success: true,
            data: {
                operators,
                engine: "json-rules-engine",
            },
        });
    } catch (error) {
        logger.error(`Error getting rule operators: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to get rule operators",
        });
    }
};

/**
 * Get rule engine cache statistics (admin only)
 */
export const getRuleCacheStats = async (req, res) => {
    try {
        const stats = getCacheStats();

        return res.status(200).json({
            success: true,
            data: {
                ...stats,
                engine: "json-rules-engine",
                cacheTTL: "5 minutes",
            },
        });
    } catch (error) {
        logger.error(`Error getting rule cache stats: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to get cache statistics",
        });
    }
};

/**
 * Validate conditions format
 */
export const validateRuleConditions = async (req, res) => {
    try {
        const { conditions } = req.body;

        if (!conditions) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "conditions object is required",
            });
        }

        // Validate using the rule engine validation
        const validation = validateConditionsFormat(conditions);

        // Also validate using the basic validation
        const basicValidation = validateConditions(conditions);

        return res.status(200).json({
            success: true,
            data: {
                valid: validation.valid && basicValidation.valid,
                errors: [
                    ...validation.errors,
                    ...(basicValidation.valid ? [] : [basicValidation.error]),
                ],
            },
        });
    } catch (error) {
        logger.error(`Error validating rule conditions: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to validate conditions",
        });
    }
};

/**
 * Get formula syntax help and available variables
 */
export const getFormulaHelp = async (req, res) => {
    try {
        return res.status(200).json({
            success: true,
            data: {
                variables: FORMULA_VARIABLES,
                functions: getAvailableFunctions(),
                examples: getFormulaExamples(),
            },
        });
    } catch (error) {
        logger.error(`Error getting formula help: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to get formula help",
        });
    }
};

/**
 * Validate a formula string
 */
export const validateFormulaEndpoint = async (req, res) => {
    try {
        const { formula } = req.body;

        if (!formula) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "formula string is required",
            });
        }

        const validation = validateFormula(formula);
        const variables = extractFormulaVariables(formula);

        return res.status(200).json({
            success: true,
            data: {
                valid: validation.valid,
                error: validation.error || null,
                variablesUsed: variables,
            },
        });
    } catch (error) {
        logger.error(`Error validating formula: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to validate formula",
        });
    }
};

/**
 * Test a formula with sample values
 */
export const testFormula = async (req, res) => {
    try {
        const { formula, baseSalary, grossSalary, employeeContext, additionalVars } = req.body;

        if (!formula) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "formula string is required",
            });
        }

        // Validate first
        const validation = validateFormula(formula);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Invalid formula: ${validation.error}`,
            });
        }

        // Evaluate with provided values
        const result = evaluateFormula(
            formula,
            baseSalary || 50000,
            grossSalary || 60000,
            employeeContext || {},
            additionalVars || {}
        );

        return res.status(200).json({
            success: true,
            data: {
                formula,
                result: result.success ? result.result : null,
                error: result.error || null,
                inputValues: {
                    baseSalary: baseSalary || 50000,
                    grossSalary: grossSalary || 60000,
                    employeeContext: employeeContext || {},
                    additionalVars: additionalVars || {},
                },
            },
        });
    } catch (error) {
        logger.error(`Error testing formula: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to test formula",
        });
    }
};
