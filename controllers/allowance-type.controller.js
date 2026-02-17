import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

export const getAllAllowanceTypes = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { isActive } = req.query;

        const where = {
            tenantId,
            deletedAt: null,
        };
        if (isActive !== undefined) {
            where.isActive = isActive === "true";
        }

        const allowanceTypes = await prisma.allowanceType.findMany({
            where,
            include: {
                _count: {
                    select: {
                        allowances: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        logger.info(`Retrieved ${allowanceTypes.length} allowance types`);

        return res.status(200).json({
            success: true,
            data: allowanceTypes,
            count: allowanceTypes.length,
        });
    } catch (error) {
        logger.error(`Error fetching allowance types: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch allowance types",
        });
    }
};

export const getAllowanceTypeById = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const allowanceType = await prisma.allowanceType.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
            include: {
                _count: {
                    select: {
                        allowances: true,
                    },
                },
            },
        });

        if (!allowanceType) {
            logger.warn(`Allowance type not found with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance type not found",
            });
        }

        logger.info(`Retrieved allowance type with ID: ${id}`);

        return res.status(200).json({
            success: true,
            data: allowanceType,
        });
    } catch (error) {
        logger.error(`Error fetching allowance type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch allowance type",
        });
    }
};

export const createAllowanceType = async (req, res) => {
    try {
        const { id: userId, tenantId } = req.user;
        const { name, code, description, isTaxable, isActive, defaultCalculationMethod, defaultAmount, defaultCalculationRuleId } = req.body;

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Name and code are required",
            });
        }

        const trimmedName = name.trim();
        const trimmedCode = code.trim();

        // If a soft-deleted allowance type exists with same name or code, restore it instead of creating (avoids unique constraint)
        const softDeleted = await prisma.allowanceType.findFirst({
            where: {
                tenantId,
                deletedAt: { not: null },
                OR: [{ name: trimmedName }, { code: trimmedCode }],
            },
        });

        let allowanceType;
        if (softDeleted) {
            allowanceType = await prisma.allowanceType.update({
                where: { id: softDeleted.id },
                data: {
                    deletedAt: null,
                    name: trimmedName,
                    code: trimmedCode,
                    description: description ?? softDeleted.description,
                    isTaxable: isTaxable !== undefined ? isTaxable : true,
                    isActive: isActive !== undefined ? isActive : true,
                    defaultCalculationMethod: defaultCalculationMethod ?? null,
                    defaultAmount: defaultAmount != null ? Number(defaultAmount) : null,
                    defaultCalculationRuleId: defaultCalculationRuleId || null,
                },
            });
            logger.info(`Restored allowance type with ID: ${allowanceType.id} (was soft-deleted)`);
        } else {
            allowanceType = await prisma.allowanceType.create({
                data: {
                    tenantId,
                    name: trimmedName,
                    code: trimmedCode,
                    description: description || null,
                    isTaxable: isTaxable !== undefined ? isTaxable : true,
                    isActive: isActive !== undefined ? isActive : true,
                    defaultCalculationMethod: defaultCalculationMethod ?? null,
                    defaultAmount: defaultAmount != null ? Number(defaultAmount) : null,
                    defaultCalculationRuleId: defaultCalculationRuleId || null,
                },
            });
            logger.info(`Created allowance type with ID: ${allowanceType.id}`);
        }
        const changes = {
            name: { before: null, after: allowanceType.name },
            code: { before: null, after: allowanceType.code },
            description: { before: null, after: allowanceType.description },
            isTaxable: { before: null, after: allowanceType.isTaxable },
        };
        await addLog(userId, tenantId, "CREATE", "AllowanceType", allowanceType.id, changes, req);

        return res.status(201).json({
            success: true,
            data: allowanceType,
            message: "Allowance type created successfully",
        });
    } catch (error) {
        logger.error(`Error creating allowance type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create allowance type",
        });
    }
};

export const updateAllowanceType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;
        const { name, code, description, isTaxable, isActive, defaultCalculationMethod, defaultAmount, defaultCalculationRuleId } = req.body;

        const existing = await prisma.allowanceType.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
        });

        if (!existing) {
            logger.warn(`Allowance type not found for update with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance type not found",
            });
        }

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (code !== undefined) updateData.code = code;
        if (description !== undefined) updateData.description = description;
        if (isTaxable !== undefined) updateData.isTaxable = isTaxable;
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

        const allowanceType = await prisma.allowanceType.update({
            where: { id },
            data: updateData,
        });

        logger.info(`Updated allowance type with ID: ${id}`);
        const changes = getChangesDiff(existing, allowanceType);
        await addLog(userId, tenantId, "UPDATE", "AllowanceType", id, changes, req);

        return res.status(200).json({
            success: true,
            data: allowanceType,
            message: "Allowance type updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating allowance type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update allowance type",
        });
    }
};

/**
 * Activate an allowance type. Dedicated endpoint for clear audit trail (ACTION: ACTIVATE).
 */
export const activateAllowanceType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const existing = await prisma.allowanceType.findFirst({
            where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance type not found",
            });
        }

        if (existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Allowance type is already active",
            });
        }

        const allowanceType = await prisma.allowanceType.update({
            where: { id },
            data: { isActive: true },
        });

        await addLog(userId, tenantId, "ACTIVATE", "AllowanceType", id, { isActive: { before: false, after: true } }, req);
        logger.info(`Allowance type ${id} activated by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: allowanceType,
            message: "Allowance type activated successfully",
        });
    } catch (error) {
        logger.error(`Error activating allowance type: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to activate allowance type",
        });
    }
};

/**
 * Deactivate an allowance type. Dedicated endpoint for clear audit trail (ACTION: DEACTIVATE).
 */
export const deactivateAllowanceType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const existing = await prisma.allowanceType.findFirst({
            where: { id, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance type not found",
            });
        }

        if (!existing.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Allowance type is already inactive",
            });
        }

        const allowanceType = await prisma.allowanceType.update({
            where: { id },
            data: { isActive: false },
        });

        await addLog(userId, tenantId, "DEACTIVATE", "AllowanceType", id, { isActive: { before: true, after: false } }, req);
        logger.info(`Allowance type ${id} deactivated by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: allowanceType,
            message: "Allowance type deactivated successfully",
        });
    } catch (error) {
        logger.error(`Error deactivating allowance type: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to deactivate allowance type",
        });
    }
};

/**
 * Permanently delete an allowance type (admin cleanup).
 * Restricted to HR_ADMIN. Only allowed when allowance type is inactive.
 * Must not be used in any salary structure.
 * Audit log is written BEFORE the delete for enterprise compliance.
 */
export const deleteAllowanceType = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const allowanceType = await prisma.allowanceType.findFirst({
            where: { id, tenantId, deletedAt: null },
            include: {
                _count: { select: { allowances: true } },
            },
        });

        if (!allowanceType) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance type not found",
            });
        }

        if (allowanceType.isActive) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete an active allowance type. Deactivate it first, then delete.",
            });
        }

        if (allowanceType._count.allowances > 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete. This allowance type is still used in salary structures. Remove it from all structures first.",
            });
        }

        // Audit log BEFORE delete (enterprise requirement)
        const auditPayload = {
            deleted: true,
            deletedAt: new Date().toISOString(),
            allowanceTypeSummary: {
                id,
                name: allowanceType.name,
                code: allowanceType.code,
            },
        };
        await addLog(userId, tenantId, "DELETE", "AllowanceType", id, auditPayload, req);

        await prisma.allowanceType.delete({ where: { id } });

        logger.info(`Permanently deleted allowance type with ID: ${id} by user ${userId}`);

        return res.status(200).json({
            success: true,
            data: { id },
            message: "Allowance type permanently deleted",
        });
    } catch (error) {
        logger.error(`Error deleting allowance type: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete allowance type",
        });
    }
};

