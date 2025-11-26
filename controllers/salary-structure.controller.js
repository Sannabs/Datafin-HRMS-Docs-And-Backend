import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { recalculateSalary } from "../calculations/salary-calculations.js";

export const getEmployeeSalaryStructure = async (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const { id: userId, tenantId, role } = req.user;

        // Data access control: Employees can only view their own salary structure
        // HR roles can view any employee's salary structure
        if (role === "EMPLOYEE" && employeeId !== userId) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only view your own salary structure",
            });
        }

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

        logger.info(`Retrieved salary structure for employee: ${employeeId}`);

        return res.status(200).json({
            success: true,
            data: salaryStructure,
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

export const getEmployeeSalaryStructures = async (req, res) => {
    try {
        const { id: employeeId } = req.params;
        const { id: userId, tenantId, role } = req.user;

        if (role === "EMPLOYEE" && employeeId !== userId) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only view your own salary structures",
            });
        }

        const salaryStructures = await prisma.salaryStructure.findMany({
            where: {
                userId: employeeId,
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
                            },
                        },
                    },
                },
            },
            orderBy: {
                effectiveDate: "desc",
            },
        });

        logger.info(`Retrieved ${salaryStructures.length} salary structures for employee: ${employeeId}`);

        return res.status(200).json({
            success: true,
            data: salaryStructures,
            count: salaryStructures.length,
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
        const { tenantId } = req.user;
        const { baseSalary, effectiveDate, endDate, currency, allowances, deductions } = req.body;

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

        const today = new Date();
        const effective = new Date(effectiveDate);
        const end = endDate ? new Date(endDate) : null;

        // Business rule: Prevent overlapping salary structure periods
        // Check if new structure dates overlap with any existing structure
        const overlapping = await prisma.salaryStructure.findFirst({
            where: {
                userId: employeeId,
                tenantId,
                OR: [
                    {
                        effectiveDate: {
                            lte: end || new Date("2099-12-31"),
                        },
                        OR: [
                            { endDate: null },
                            { endDate: { gte: effective } },
                        ],
                    },
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

        // Business rule: Only one active salary structure per employee
        // If creating a new active structure (no end date or end date in future),
        // automatically end the previous active structure
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
                // Set end date to day before new structure starts to prevent gaps
                await prisma.salaryStructure.update({
                    where: { id: activeStructure.id },
                    data: {
                        endDate: new Date(effective.getTime() - 1),
                    },
                });
            }
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
                effectiveDate: effective,
                endDate: end,
                currency: currency || "USD",
            },
        });

        if (allowances && allowances.length > 0) {
            for (const allowance of allowances) {
                await prisma.allowance.create({
                    data: {
                        salaryStructureId: salaryStructure.id,
                        allowanceTypeId: allowance.allowanceTypeId,
                        amount: allowance.amount,
                        calculationMethod: allowance.calculationMethod || "FIXED",
                    },
                });
            }
        }

        if (deductions && deductions.length > 0) {
            for (const deduction of deductions) {
                await prisma.deduction.create({
                    data: {
                        salaryStructureId: salaryStructure.id,
                        deductionTypeId: deduction.deductionTypeId,
                        amount: deduction.amount,
                        calculationMethod: deduction.calculationMethod || "FIXED",
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
        const { grossSalary: finalGross, netSalary } = await recalculateSalary(
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

        return res.status(201).json({
            success: true,
            data: finalStructure,
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
        const { tenantId } = req.user;
        const { baseSalary, effectiveDate, endDate, currency } = req.body;

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

        const updateData = {};
        if (baseSalary !== undefined) updateData.baseSalary = baseSalary;
        if (effectiveDate !== undefined) updateData.effectiveDate = new Date(effectiveDate);
        if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
        if (currency !== undefined) updateData.currency = currency;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        // Recalculate gross salary if base salary changed
        // Base salary change affects percentage-based allowances
        if (baseSalary !== undefined) {
            const { grossSalary } = await recalculateSalary(
                baseSalary,
                salaryStructure.allowances,
                salaryStructure.deductions,
                employeeContext,
                tenantId
            );
            updateData.grossSalary = grossSalary;
        }

        const updated = await prisma.salaryStructure.update({
            where: { id },
            data: updateData,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
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

        return res.status(200).json({
            success: true,
            data: updated,
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

export const deleteSalaryStructure = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const salaryStructure = await prisma.salaryStructure.findFirst({
            where: {
                id,
                tenantId,
            },
        });

        if (!salaryStructure) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Salary structure not found",
            });
        }

        // Soft delete: Set endDate to today to deactivate the structure
        // Preserves historical data for audit and payroll processing
        const deleted = await prisma.salaryStructure.update({
            where: { id },
            data: {
                endDate: new Date(),
            },
        });

        logger.info(`Soft deleted salary structure with ID: ${id}`);

        return res.status(200).json({
            success: true,
            data: deleted,
            message: "Salary structure deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting salary structure: ${error.message}`, {
            error: error.stack,
        });

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
        const { tenantId } = req.user;
        const { allowanceTypeId, amount, calculationMethod } = req.body;

        if (!allowanceTypeId || amount === undefined) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Allowance type ID and amount are required",
            });
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

        const allowance = await prisma.allowance.create({
            data: {
                salaryStructureId: id,
                allowanceTypeId,
                amount,
                calculationMethod: calculationMethod || "FIXED",
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
        const { tenantId } = req.user;

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
        const { tenantId } = req.user;
        const { deductionTypeId, amount, calculationMethod } = req.body;

        if (!deductionTypeId || amount === undefined) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Deduction type ID and amount are required",
            });
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

        const deduction = await prisma.deduction.create({
            data: {
                salaryStructureId: id,
                deductionTypeId,
                amount,
                calculationMethod: calculationMethod || "FIXED",
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
        const { tenantId } = req.user;

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

