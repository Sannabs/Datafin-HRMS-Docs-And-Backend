import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

export const getAllDeductionTypes = async (req, res) => {
    try {
        const { tenantId } = req.user;

        const deductionTypes = await prisma.deductionType.findMany({
            where: {
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
        const { tenantId } = req.user;

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
        const { tenantId } = req.user;
        const { name, code, description, isStatutory } = req.body;

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
            },
        });

        logger.info(`Created deduction type with ID: ${deductionType.id}`);

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
        const { tenantId } = req.user;
        const { name, code, description, isStatutory } = req.body;

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

export const deleteDeductionType = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const deductionType = await prisma.deductionType.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
        });

        if (!deductionType) {
            logger.warn(`Deduction type not found for deletion with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Deduction type not found",
            });
        }

        // Prevent deletion if deduction type is used in active salary structures
        // Active structure = no endDate (currently in use)
        const activeUsage = await prisma.deduction.findFirst({
            where: {
                deductionTypeId: id,
                salaryStructure: {
                    endDate: null,
                },
            },
            include: {
                salaryStructure: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                employeeId: true,
                            },
                        },
                    },
                },
            },
        });

        if (activeUsage) {
            logger.warn(`Cannot delete deduction type ${id} - in use by active salary structure`);
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete deduction type. It is currently used in active salary structures.",
                data: {
                    usedBy: {
                        employeeId: activeUsage.salaryStructure.user.employeeId,
                        employeeName: activeUsage.salaryStructure.user.name,
                    },
                },
            });
        }

        const deleted = await prisma.deductionType.update({
            where: { id },
            data: {
                deletedAt: new Date(),
            },
        });

        logger.info(`Soft deleted deduction type with ID: ${id}`);

        return res.status(200).json({
            success: true,
            data: deleted,
            message: "Deduction type deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting deduction type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete deduction type",
        });
    }
};

