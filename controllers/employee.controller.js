import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import {
    uploadFile,
    generateFilename,
    extractFilenameFromUrl,
    deleteFile,
} from "../config/storage.config.js";
import {
    parseEmployeeId,
    validateEmployeeIdDigits,
    isEmployeeIdUnique,
} from "../utils/generateEmployeeId.js";

// get all employees
export const getAllEmployees = async (req, res) => {
    try {
        const { tenantId } = req.user;

        // tenant scope
        const where = {
            isDeleted: false,
            ...(tenantId && { tenantId }),
        };

        // Fetch all employees with related data
        const employees = await prisma.user.findMany({
            where,
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Remove sensitive information (password) from response
        const sanitizedEmployees = employees.map((employee) => {
            const { password, ...employeeWithoutPassword } = employee;
            return employeeWithoutPassword;
        });

        logger.info(`Retrieved ${sanitizedEmployees.length} employees`);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployees,
            count: sanitizedEmployees.length,
        });
    } catch (error) {
        logger.error(`Error fetching employees: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch employees",
        });
    }
};

// get employee by id
export const getEmployeeById = async (req, res) => {
    try {
        const { id, tenantId } = req.user;

        if (!id) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        const where = {
            id,
            isDeleted: false,
            ...(tenantId && { tenantId }),
        };

        // Fetch employee with related data
        const employee = await prisma.user.findUnique({
            where,
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        if (!employee) {
            logger.warn(`Employee not found with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = employee;

        logger.info(`Retrieved employee with ID: ${id}`);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
        });
    } catch (error) {
        logger.error(`Error fetching employee by ID: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch employee",
        });
    }
};




export const updateMyProfle = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const updateData = req.body;

        if (!id) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        const existingEmployee = await prisma.user.findFirst({
            where: {
                id,
                tenantId,
                isDeleted: false,
            },
        });

        if (!existingEmployee) {
            logger.warn(`Employee not found for update with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // allowed fields to update
        const allowedFields = [
            "name",
            "phone",
            "address",
            "gender",
            "dateOfBirth",
            "SSN",
            "tinNumber",
            "image",
            "emergencyContact",
        ];

        // Filter out disallowed fields and build update object
        const filteredData = {};
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                filteredData[field] = updateData[field];
            }
        }

        // If no valid fields to update
        if (Object.keys(filteredData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        // Validate departmentId and positionId if provided
        if (filteredData.departmentId) {
            const department = await prisma.department.findFirst({
                where: {
                    id: filteredData.departmentId,
                    tenantId,
                    deletedAt: null,
                },
            });

            if (!department) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Invalid department ID",
                });
            }
        }

        if (filteredData.positionId) {
            const position = await prisma.position.findFirst({
                where: {
                    id: filteredData.positionId,
                    tenantId,
                    deletedAt: null,
                },
            });

            if (!position) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Invalid position ID",
                });
            }
        }

        // Update employee
        const updatedEmployee = await prisma.user.update({
            where: {
                id,
                tenantId,
                isDeleted: false,
            },
            data: filteredData,
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = updatedEmployee;


        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
            message: "Employee updated successfully",
        });
    } catch (error) {
        // Handle Prisma unique constraint errors
        if (error.code === "P2002") {
            logger.warn(`Unique constraint violation: ${error.meta?.target}`);
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "A record with this value already exists",
            });
        }

        // Handle record not found
        if (error.code === "P2025") {
            logger.warn(`Employee not found for update`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        logger.error(`Error updating employee: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update employee",
        });
    }
};


// update employee by admin
export const updateEmployee = async (req, res) => {
    try {
        const {tenantId } = req.user;
        const actorId = req.user.id;
        const { id } = req.params;
        const updateData = req.body;
        
        if (!actorId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        const existingEmployee = await prisma.user.findFirst({
            where: {
                id,
                tenantId,
                isDeleted: false,
            },
        });

        if (!existingEmployee) {
            logger.warn(`Employee not found for update with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // allowed fields to update
        const allowedFields = [
            "name",
            "phone",
            "address",
            "gender",
            "dateOfBirth",
            "SSN",
            "tinNumber",
            "image",
            "departmentId",
            "positionId",
            "status",
            "employmentType",
            "hireDate",
            "role",
        ];

        // Filter out disallowed fields and build update object
        const filteredData = {};
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                filteredData[field] = updateData[field];
            }
        }

        // If no valid fields to update
        if (Object.keys(filteredData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        // Validate departmentId and positionId if provided
        if (filteredData.departmentId) {
            const department = await prisma.department.findFirst({
                where: {
                    id: filteredData.departmentId,
                    tenantId,
                    deletedAt: null,
                },
            });

            if (!department) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Invalid department ID",
                });
            }
        }

        if (filteredData.positionId) {
            const position = await prisma.position.findFirst({
                where: {
                    id: filteredData.positionId,
                    tenantId,
                    deletedAt: null,
                },
            });

            if (!position) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Invalid position ID",
                });
            }
        }

        // Update employee
        const updatedEmployee = await prisma.user.update({
            where: {
                id,
                tenantId,
                isDeleted: false,
            },
            data: filteredData,
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = updatedEmployee;

        logger.info(`Updated employee with ID: ${id}`);
        const changes = getChangesDiff(existingEmployee, updatedEmployee);
        await addLog(actorId, tenantId, "UPDATE", "Employee", id, changes, req);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
            message: "Employee updated successfully",
        });
    } catch (error) {
        // Handle Prisma unique constraint errors
        if (error.code === "P2002") {
            logger.warn(`Unique constraint violation: ${error.meta?.target}`);
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "A record with this value already exists",
            });
        }

        // Handle record not found
        if (error.code === "P2025") {
            logger.warn(`Employee not found for update`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        logger.error(`Error updating employee: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update employee",
        });
    }
};

// update employee ID digits (HR only) - only the 4-digit suffix is editable
export const updateEmployeeIdDigits = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const employeeIdParam = req.params.id;
        const { digits } = req.body;

        if (!tenantId || !employeeIdParam) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (!digits || typeof digits !== "string") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "digits (4 numeric characters) is required",
            });
        }

        const trimmedDigits = digits.trim();
        if (!validateEmployeeIdDigits(trimmedDigits)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "digits must be exactly 4 numeric characters (0000-9999)",
            });
        }

        const employee = await prisma.user.findFirst({
            where: {
                id: employeeIdParam,
                tenantId,
                isDeleted: false,
            },
            include: {
                tenant: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true } },
            },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        const parsed = parseEmployeeId(employee.employeeId);
        if (!parsed) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message:
                    "Employee ID format does not support digit edits. Only IDs in format [company]-[department]-[digits] can be updated.",
            });
        }

        const newFullId = `${parsed.companyPrefix}-${parsed.deptPrefix}-${trimmedDigits}`;
        const unique = await isEmployeeIdUnique(tenantId, newFullId, employee.id);
        if (!unique) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Employee ID ${newFullId} already exists in this company. Choose different digits.`,
            });
        }

        const updated = await prisma.user.update({
            where: { id: employee.id },
            data: { employeeId: newFullId },
            include: {
                department: { select: { id: true, name: true } },
                position: { select: { id: true, title: true } },
                tenant: { select: { id: true, name: true, code: true } },
            },
        });

        const { password, ...sanitized } = updated;
        logger.info(`Updated employee ID digits for ${employee.id} to ${newFullId}`);
        await addLog(req.user.id, tenantId, "UPDATE", "Employee", employee.id, {
            employeeId: { from: employee.employeeId, to: newFullId },
        }, req);

        return res.status(200).json({
            success: true,
            data: sanitized,
            message: "Employee ID updated successfully",
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee ID already exists in this company",
            });
        }
        logger.error(`Error updating employee ID digits: ${error.message}`, {
            error: error.stack,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update employee ID",
        });
    }
};

// terminate employee
export const terminateEmployee = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const actorId = id;

        if (!id) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (!tenantId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        // Check if employee exists and belongs to the same tenant
        const employee = await prisma.user.findFirst({
            where: {
                id,
                tenantId,
                isDeleted: false,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for termination with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Check if employee is already terminated
        if (employee.status === "TERMINATED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee is already terminated",
            });
        }

        // Terminate employee (set status to TERMINATED)
        const terminatedEmployee = await prisma.user.update({
            where: {
                id,
                tenantId,
            },
            data: {
                status: "TERMINATED",
            },
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = terminatedEmployee;

        logger.info(`Terminated employee with ID: ${id}`);
        const changes = getChangesDiff(employee, terminatedEmployee);
        await addLog(actorId, tenantId, "TERMINATE", "Employee", id, changes, req);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
            message: "Employee terminated successfully",
        });
    } catch (error) {
        // Handle record not found
        if (error.code === "P2025") {
            logger.warn(`Employee not found for termination`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        logger.error(`Error terminating employee: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to terminate employee",
        });
    }
};

// reactivate employee
export const reactivateEmployee = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const actorId = id;

        if (!id) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (!tenantId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        // Check if employee exists and belongs to the same tenant
        const employee = await prisma.user.findFirst({
            where: {
                id,
                tenantId,
                isDeleted: false,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for reactivation with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Check if employee is already active
        if (employee.status === "ACTIVE") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee is already active",
            });
        }

        // Reactivate employee (set status to ACTIVE)
        const reactivatedEmployee = await prisma.user.update({
            where: {
                id,
                tenantId,
            },
            data: {
                status: "ACTIVE",
            },
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = reactivatedEmployee;

        logger.info(`Reactivated employee with ID: ${id}`);
        const changes = getChangesDiff(employee, reactivatedEmployee);
        await addLog(actorId, tenantId, "REACTIVATE", "Employee", id, changes, req);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
            message: "Employee reactivated successfully",
        });
    } catch (error) {
        // Handle record not found
        if (error.code === "P2025") {
            logger.warn(`Employee not found for reactivation`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        logger.error(`Error reactivating employee: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to reactivate employee",
        });
    }
};

// archive employee
export const archiveEmployee = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const actorId = id;

        if (!id) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (!tenantId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        // Check if employee exists and belongs to the same tenant
        const employee = await prisma.user.findFirst({
            where: {
                id,
                tenantId,
                isDeleted: false,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for archiving with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Check if employee is already archived
        if (employee.isDeleted) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee is already archived",
            });
        }

        // Archive employee (soft delete - set isDeleted to true and deletedAt timestamp)
        const archivedEmployee = await prisma.user.update({
            where: {
                id,
                tenantId,
            },
            data: {
                isDeleted: true,
                deletedAt: new Date(),
            },
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = archivedEmployee;

        logger.info(`Archived employee with ID: ${id}`);
        const changes = getChangesDiff(employee, archivedEmployee);
        await addLog(actorId, tenantId, "ARCHIVE", "Employee", id, changes, req);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
            message: "Employee archived successfully",
        });
    } catch (error) {
        // Handle record not found
        if (error.code === "P2025") {
            logger.warn(`Employee not found for archiving`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        logger.error(`Error archiving employee: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to archive employee",
        });
    }
};

// restore employee (unarchive)
export const restoreEmployee = async (req, res) => {
    try {
        const { id, tenantId } = req.user;
        const actorId = id;

        if (!id) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (!tenantId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        // Check if employee exists and belongs to the same tenant (including archived ones)
        const employee = await prisma.user.findFirst({
            where: {
                id,
                tenantId,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for restoration with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Check if employee is already restored (not archived)
        if (!employee.isDeleted) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee is not archived",
            });
        }

        // Restore employee (unarchive - set isDeleted to false and clear deletedAt)
        const restoredEmployee = await prisma.user.update({
            where: {
                id,
                tenantId,
            },
            data: {
                isDeleted: false,
                deletedAt: null,
            },
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        description: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                        code: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = restoredEmployee;

        logger.info(`Restored employee with ID: ${id}`);
        const changes = getChangesDiff(employee, restoredEmployee);
        await addLog(actorId, tenantId, "RESTORE", "Employee", id, changes, req);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
            message: "Employee restored successfully",
        });
    } catch (error) {
        // Handle record not found
        if (error.code === "P2025") {
            logger.warn(`Employee not found for restoration`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        logger.error(`Error restoring employee: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to restore employee",
        });
    }
};


export const updateProfilePicture = async (req, res) => {
    const id = req.user.id;
    try {

        const user = await prisma.user.findUnique({
            where: {
                id,
                isDeleted: false,
            },
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "User not found",
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "User not found",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No file uploaded",
            });
        }


        const filename = generateFilename(req.file.originalname, "profile");
        const imageUrl = await uploadFile(
            req.file.buffer,
            filename,
            req.file.mimetype
        );

        const updatedUser = await prisma.user.update({
            where: { id },
            data: { image: imageUrl },
            select: {
                id: true,
                email: true,
                name: true,
                emailVerified: true,
                image: true,
                tenantId: true,
                createdAt: true,
                updatedAt: true,
            },
        });


        if (user.image) {
            try {
                const oldKey = extractFilenameFromUrl(user.image);
                if (oldKey) await deleteFile(oldKey);
            } catch (deleteErr) {
                logger.warn(`Could not delete old profile image: ${deleteErr.message}`);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Profile image updated successfully",
            data: updatedUser,
        });


    } catch (error) {

        logger.error(`Error updating profile picture: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update profile picture",
        });
    }

}