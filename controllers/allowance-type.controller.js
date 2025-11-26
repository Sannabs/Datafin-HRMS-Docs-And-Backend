import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

export const getAllAllowanceTypes = async (req, res) => {
    try {
        const { tenantId } = req.user;

        const allowanceTypes = await prisma.allowanceType.findMany({
            where: {
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
        const { tenantId } = req.user;
        const { name, code, description, isTaxable } = req.body;

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Name and code are required",
            });
        }

        const allowanceType = await prisma.allowanceType.create({
            data: {
                tenantId,
                name,
                code,
                description: description || null,
                isTaxable: isTaxable !== undefined ? isTaxable : true,
            },
        });

        logger.info(`Created allowance type with ID: ${allowanceType.id}`);

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
        const { tenantId } = req.user;
        const { name, code, description, isTaxable } = req.body;

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

export const deleteAllowanceType = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const allowanceType = await prisma.allowanceType.findFirst({
            where: {
                id,
                tenantId,
                deletedAt: null,
            },
        });

        if (!allowanceType) {
            logger.warn(`Allowance type not found for deletion with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Allowance type not found",
            });
        }

        const activeUsage = await prisma.allowance.findFirst({
            where: {
                allowanceTypeId: id,
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
            logger.warn(`Cannot delete allowance type ${id} - in use by active salary structure`);
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot delete allowance type. It is currently used in active salary structures.",
                data: {
                    usedBy: {
                        employeeId: activeUsage.salaryStructure.user.employeeId,
                        employeeName: activeUsage.salaryStructure.user.name,
                    },
                },
            });
        }

        const deleted = await prisma.allowanceType.update({
            where: { id },
            data: {
                deletedAt: new Date(),
            },
        });

        logger.info(`Soft deleted allowance type with ID: ${id}`);

        return res.status(200).json({
            success: true,
            data: deleted,
            message: "Allowance type deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting allowance type: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete allowance type",
        });
    }
};

