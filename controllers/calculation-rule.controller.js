import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { evaluateRule, calculateRuleAmount } from "../services/rule-engine.service.js";
import { validateConditions, validateAction } from "../utils/rule-validation.utils.js";

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
        const { tenantId } = req.user;
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
        const { tenantId } = req.user;
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

export const deleteCalculationRule = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

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
        const { tenantId } = req.user;
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

        // Evaluate rule
        const matches = evaluateRule(rule, employeeContext);

        let calculatedAmount = 0;
        if (matches) {
            calculatedAmount = calculateRuleAmount(
                rule,
                employeeContext,
                baseSalary || 0,
                grossSalary || 0
            );
        }

        logger.info(`Tested calculation rule: ${id}`, {
            matches,
            calculatedAmount,
        });

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

