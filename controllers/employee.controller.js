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
    generateEmployeeId,
} from "../utils/generateEmployeeId.js";

// get all employees
export const getAllEmployees = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

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

// create employee (manual add for payroll, no invite)
export const createEmployee = async (req, res) => {
    try {
        const { role: actorRole, id: actorId } = req.user || {};
        const tenantId = req.effectiveTenantId ?? req.user?.tenantId;
        if (!tenantId || !actorId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        // Only HR roles can create employees manually
        const allowedRoles = ["HR_ADMIN", "HR_STAFF"];
        if (!allowedRoles.includes(actorRole)) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "Only HR users can create employees",
            });
        }

        const {
            name,
            email,
            role,
            departmentId,
            positionId,
            employmentStatus,
            employmentType,
            hireDate,
            baseSalary,
            salaryPeriodType,
            salaryEffectiveDate,
            salaryCurrency,
        } = req.body || {};

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Name is required",
            });
        }

        if (!email || typeof email !== "string" || !email.trim()) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Email is required",
            });
        }

        // Email format validation (same as invitations.controller)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Invalid email format",
            });
        }

        const validRoles = ["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Invalid role. Must be one of: HR_ADMIN, HR_STAFF, STAFF, DEPARTMENT_ADMIN",
            });
        }

        // Validate department if provided
        let department = null;
        if (departmentId) {
            department = await prisma.department.findFirst({
                where: {
                    id: departmentId,
                    tenantId,
                    deletedAt: null,
                },
            });

            if (!department) {
                return res.status(404).json({
                    success: false,
                    error: "Not Found",
                    message: "Department not found or does not belong to this tenant",
                });
            }
        }

        // Validate position if provided
        if (positionId) {
            const position = await prisma.position.findFirst({
                where: {
                    id: positionId,
                    tenantId,
                    deletedAt: null,
                },
            });

            if (!position) {
                return res.status(404).json({
                    success: false,
                    error: "Not Found",
                    message: "Position not found or does not belong to this tenant",
                });
            }
        }

        const VALID_EMPLOYMENT_STATUSES = ["INACTIVE", "ACTIVE", "TERMINATED", "RESIGNED", "ON_LEAVE"];
        const VALID_EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];

        if (employmentStatus != null && employmentStatus !== "") {
            if (!VALID_EMPLOYMENT_STATUSES.includes(employmentStatus)) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Invalid employment status. Must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}`,
                });
            }
        }

        if (employmentType != null && employmentType !== "") {
            if (!VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: `Invalid employment type. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}`,
                });
            }
        }

        // Validate and parse base salary / period
        if (baseSalary == null || baseSalary === "") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Base salary is required",
            });
        }
        const baseSalaryNum = Number(baseSalary);
        if (Number.isNaN(baseSalaryNum) || baseSalaryNum <= 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Base salary must be a positive number",
            });
        }

        const validPeriodTypes = ["MONTHLY", "ANNUAL"];
        const salaryPeriodTypeVal =
            salaryPeriodType != null && validPeriodTypes.includes(String(salaryPeriodType).toUpperCase())
                ? String(salaryPeriodType).toUpperCase()
                : "MONTHLY";

        const salaryCurrencyVal =
            salaryCurrency != null && String(salaryCurrency).trim() !== ""
                ? String(salaryCurrency).trim()
                : "USD";

        const hireDateParsed = hireDate ? new Date(hireDate) : null;
        const salaryEffectiveDateParsed = salaryEffectiveDate ? new Date(salaryEffectiveDate) : null;

        // Check if user already exists in this tenant
        const existingUser = await prisma.user.findFirst({
            where: {
                email,
                tenantId,
                isDeleted: false,
            },
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "User with this email already exists in this tenant",
            });
        }

        // Load tenant (for employeeId generation)
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true, code: true },
        });

        if (!tenant) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Tenant not found",
            });
        }

        const employeeId = await generateEmployeeId(tenantId, tenant, department);

        // Create user account (no invitation, no password yet; payroll-only)
        const newUser = await prisma.user.create({
            data: {
                tenantId,
                email,
                password: null,
                name: name.trim(),
                emailVerified: false,
                role: role || "STAFF",
                employeeId,
                departmentId: departmentId || null,
                positionId: positionId || null,
                status: employmentStatus || "ACTIVE",
                employmentType: employmentType || "FULL_TIME",
                hireDate: hireDateParsed,
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

        // Create salary structure for this employee
        try {
            const effectiveDate = salaryEffectiveDateParsed || hireDateParsed || new Date();
            await prisma.salaryStructure.create({
                data: {
                    tenantId,
                    userId: newUser.id,
                    baseSalary: baseSalaryNum,
                    grossSalary: baseSalaryNum,
                    salaryPeriodType: salaryPeriodTypeVal,
                    effectiveDate: new Date(effectiveDate),
                    currency: salaryCurrencyVal,
                },
            });
        } catch (salaryError) {
            logger.error(
                `Failed to create salary structure for employee ${newUser.id}: ${salaryError.message}`,
                { error: salaryError.stack }
            );
            // Do not fail employee creation; HR can add salary structure later
        }

        const { password, ...sanitizedEmployee } = newUser;

        logger.info(`Created employee ${sanitizedEmployee.id} (${sanitizedEmployee.email}) for tenant ${tenantId}`);

        return res.status(201).json({
            success: true,
            data: sanitizedEmployee,
            message: "Employee created successfully",
        });
    } catch (error) {
        logger.error(`Error creating employee: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create employee",
        });
    }
};

// get employee by id
export const getEmployeeById = async (req, res) => {
    try {
        const { id } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

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
        const { id } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
            "addressLine1",
            "addressLine2",
            "gender",
            "dateOfBirth",
            "SSN",
            "tinNumber",
            "image",
            "emergencyContactName",
            "emergencyContactRelationship",
            "emergencyContactPhone",
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
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
        const { id } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
        const { id } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
        const { id } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
        const { id } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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


export const removeProfilePicture = async (req, res) => {
    const id = req.user.id;
    try {
        const user = await prisma.user.findUnique({
            where: { id, isDeleted: false },
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "User not found",
            });
        }
        if (user.image) {
            try {
                const oldKey = extractFilenameFromUrl(user.image);
                if (oldKey) await deleteFile(oldKey);
            } catch (deleteErr) {
                logger.warn(`Could not delete profile image file: ${deleteErr.message}`);
            }
        }
        const updatedUser = await prisma.user.update({
            where: { id },
            data: { image: null },
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
        return res.status(200).json({
            success: true,
            message: "Profile picture removed",
            data: updatedUser,
        });
    } catch (error) {
        logger.error(`Error removing profile picture: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to remove profile picture",
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


export const getHomeStats = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();

        let entitlement = await prisma.yearlyEntitlement.findFirst({
            where: { tenantId, userId, year: currentYear },
            select: {
                allocatedDays: true,
                accruedDays: true,
                carriedOverDays: true,
                adjustmentDays: true,
                usedDays: true,
                pendingDays: true,
            },
        });

        if (!entitlement) {
            const policy = await prisma.annualLeavePolicy.findFirst({
                where: { tenantId },
            });

            if (!policy) {
                return res.status(404).json({
                    success: false,
                    error: "Not Found",
                    message: "leave policy not configured for this tenant",
                });
            }

            const yearStartDate = new Date(currentYear, 0, 1);
            const yearEndDate = new Date(currentYear, 11, 31);

            let allocatedDays = 0;
            let accruedDays = 0;

            if (policy.accrualMethod === "FRONT_LOADED") {
                allocatedDays = policy.defaultDaysPerYear;
            }

            let carryoverExpiryDate = null;
            if (policy.carryoverExpiryMonths != null) {
                // Months after year-end: e.g. 3 => last day of March next year
                carryoverExpiryDate = new Date(currentYear + 1, policy.carryoverExpiryMonths - 1, 0);
            }

            entitlement = await prisma.yearlyEntitlement.create({
                data: {
                    tenantId,
                    userId,
                    policyId: policy.id,
                    year: currentYear,
                    allocatedDays,
                    accruedDays,
                    carriedOverDays: 0,
                    adjustmentDays: 0,
                    usedDays: 0,
                    pendingDays: 0,
                    encashedDays: 0,
                    encashmentAmount: 0,
                    yearStartDate,
                    yearEndDate,
                    lastAccrualDate: null,
                    carryoverExpiryDate,
                },
                select: {
                    allocatedDays: true,
                    accruedDays: true,
                    carriedOverDays: true,
                    adjustmentDays: true,
                    usedDays: true,
                    pendingDays: true,
                },
            });

            logger.info(`Created yearly entitlement for user ${userId}, year ${currentYear}`);
        }

        const availableBalance =
            entitlement.allocatedDays +
            entitlement.accruedDays +
            entitlement.carriedOverDays +
            entitlement.adjustmentDays -
            entitlement.usedDays -
            entitlement.pendingDays;

        const [payslip, holiday] = await Promise.all([
            prisma.payslip.findFirst({
                where: {
                    userId,
                    payrollRun: { tenantId },
                },
                orderBy: { generatedAt: "desc" },
                select: { netSalary: true, grossSalary: true, totalDeductions: true },
            }),
            prisma.holiday.findFirst({
                where: {
                    tenantId,
                    isActive: true,
                    date: { gte: currentDate },
                },
                orderBy: { date: "asc" },
                select: { date: true },
            }),
        ]);

        // Use stored netSalary; if missing or zero, compute from gross - deductions (same as Pay tab logic)
        let latestNetPay = null;
        if (payslip) {
            const stored = payslip.netSalary;
            if (stored != null && Number(stored) > 0) {
                latestNetPay = Number(stored);
            } else {
                const gross = Number(payslip.grossSalary) || 0;
                const deductions = Number(payslip.totalDeductions) || 0;
                latestNetPay = Math.max(0, Math.round((gross - deductions) * 100) / 100);
            }
        }

        res.status(200).json({
            success: true,
            data: {
                leaveBalance: availableBalance,
                latestPayslip: latestNetPay,
                nextHoliday: holiday?.date ?? null,
                pendingReviews: null,
            },
        });
    } catch (error) {
        logger.error(`getHomeStats error: ${error.message}`, { userId: req.user?.id, error });
        res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to load home stats",
        });
    }
};