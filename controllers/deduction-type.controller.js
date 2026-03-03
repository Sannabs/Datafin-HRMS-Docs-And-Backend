import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

export const getAllDeductionTypes = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { isActive } = req.query;

        const where = {
            tenantId,
            deletedAt: null,
        };
        if (isActive !== undefined) {
            where.isActive = isActive === "true";
        }

        const deductionTypes = await prisma.deductionType.findMany({
            where,
            include: {
                _count: {
                    select: {
                        deductions: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        logger.info(`Retrieved ${deductionTypes.length} deduction types`);

        return res.status(200).json({
            success: true,
            data: deductionTypes,
            count: deductionTypes.length,
        });
    } catch (error) {
        logger.error(`Error fetching deduction types: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch deduction types",
        });
    }
};

export const getDeductionTypeById = async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const deductionType = await prisma.deductionType.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
            include: {
                _count: {
                    select: {
                        deductions: true,
                    },
                },
            },
        });

        if (!deductionType) {
            logger.warn(`Deduction type not found with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction type not found",
            });
        }

        logger.info(`Retrieved deduction type with ID: ${id}`);

        return res.status(200).json({
            success: true,
            data: deductionType,
        });
    } catch (error) {
        logger.error(`Error fetching deduction type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch deduction type",
        });
    }
};

export const createDeductionType = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { name, code, description, isStatutory, isActive, defaultCalculationMethod, defaultAmount, defaultCalculationRuleId } = req.body;

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Name and code are required",
            });
        }

        const deductionType = await prisma.deductionType.create({
            data: {
                tenantId,
                name,
                code,
                description: description || null,
                isStatutory: isStatutory !== undefined ? isStatutory : false,
                isActive: isActive !== undefined ? isActive : true,
                defaultCalculationMethod: defaultCalculationMethod ?? null,
                defaultAmount: defaultAmount != null ? Number(defaultAmount) : null,
                defaultCalculationRuleId: defaultCalculationRuleId || null,
            },
        });

        logger.info(`Created deduction type with ID: ${deductionType.id}`);
        const changes = {
            name: { before: null, after: deductionType.name },
            code: { before: null, after: deductionType.code },
            description: { before: null, after: deductionType.description },
            isStatutory: { before: null, after: deductionType.isStatutory },
        };
        await addLog(userId, tenantId, "CREATE", "DeductionType", deductionType.id, changes, req);

        return res.status(201).json({
            success: true,
            data: deductionType,
            message: "Deduction type created successfully",
        });
    } catch (error) {
        logger.error(`Error creating deduction type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create deduction type",
        });
    }
};

export const updateDeductionType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { name, code, description, isStatutory, isActive, defaultCalculationMethod, defaultAmount, defaultCalculationRuleId } = req.body;

        const existing = await prisma.deductionType.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
        });

        if (!existing) {
            logger.warn(`Deduction type not found for update with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction type not found",
            });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;
        if (isStatutory !== undefined) updateData.isStatutory = isStatutory;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (defaultCalculationMethod !== undefined) updateData.defaultCalculationMethod = defaultCalculationMethod || null;
        if (defaultAmount !== undefined) updateData.defaultAmount = defaultAmount != null ? Number(defaultAmount) : null;
        if (defaultCalculationRuleId !== undefined) updateData.defaultCalculationRuleId = defaultCalculationRuleId || null;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        const deductionType = await prisma.deductionType.update({
            where: { id },
            data: updateData,
        });

        logger.info(`Updated deduction type with ID: ${id}`);
        const changes = getChangesDiff(existing, deductionType);
        await addLog(userId, tenantId, "UPDATE", "DeductionType", id, changes, req);

        return res.status(200).json({
            success: true,
            data: deductionType,
            message: "Deduction type updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating deduction type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update deduction type",
        });
    }
};

/**
 * Activate a deduction type. Dedicated endpoint for clear audit trail (ACTION: ACTIVATE).
 */
export const activateDeductionType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const existing = await prisma.deductionType.findFirst({
            where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction type not found",
            });
        }

        if (existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Deduction type is already active",
            });
        }

        const deductionType = await prisma.deductionType.update({
            where: { id },
            data: { isActive: true },
        });

        await addLog(userId, tenantId, "ACTIVATE", "DeductionType", id, { isActive: { before: false, after: true } }, req);
        logger.info(`Deduction type ${id} activated by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: deductionType,
            message: "Deduction type activated successfully",
        });
    } catch (error) {
        logger.error(`Error activating deduction type: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to activate deduction type",
        });
    }
};

/**
 * Deactivate a deduction type. Dedicated endpoint for clear audit trail (ACTION: DEACTIVATE).
 */
export const deactivateDeductionType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const existing = await prisma.deductionType.findFirst({
            where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction type not found",
            });
        }

        if (!existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Deduction type is already inactive",
            });
        }

        const deductionType = await prisma.deductionType.update({
            where: { id },
            data: { isActive: false },
        });

        await addLog(userId, tenantId, "DEACTIVATE", "DeductionType", id, { isActive: { before: true, after: false } }, req);
        logger.info(`Deduction type ${id} deactivated by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: deductionType,
            message: "Deduction type deactivated successfully",
        });
    } catch (error) {
        logger.error(`Error deactivating deduction type: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to deactivate deduction type",
        });
    }
};

/**
 * Permanently delete a deduction type (admin cleanup).
 * Restricted to HR_ADMIN. Only allowed when deduction type is inactive.
 * Must not be used in any salary structure.
 * Audit log is written BEFORE the delete for enterprise compliance.
 */
export const deleteDeductionType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const deductionType = await prisma.deductionType.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                _count: { select: { deductions: true } },
            },
        });

        if (!deductionType) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction type not found",
            });
        }

        if (deductionType.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete an active deduction type. Deactivate it first, then delete.",
            });
        }

        if (deductionType._count.deductions > 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete. This deduction type is still used in salary structures. Remove it from all structures first.",
            });
        }

        // Audit log BEFORE delete (enterprise requirement)
        const auditPayload = {
            deleted: true,
            deletedAt: new Date().toISOString(),
            deductionTypeSummary: {
                id,
                name: deductionType.name,
                code: deductionType.code,
            },
        };
        await addLog(userId, tenantId, "DELETE", "DeductionType", id, auditPayload, req);

        await prisma.deductionType.delete({ where: { id } });

        logger.info(`Permanently deleted deduction type with ID: ${id} by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: { id },
            message: "Deduction type permanently deleted",
        });
    } catch (error) {
        logger.error(`Error deleting deduction type: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete deduction type",
        });
    }
};

