import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import {
    uploadFile,
    generateFilename,
    extractFilenameFromUrl,
    deleteFile,
    getFile,
} from "../config/storage.config.js";
import {
    parseEmployeeId,
    validateEmployeeIdDigits,
    isEmployeeIdUnique,
} from "../utils/generateEmployeeId.js";
import { createEmployeeInternal } from "../services/employee-create-internal.service.js";
import { escapeCsv, formatDateForCsv } from "../utils/csv.utils.js";
import {
    getLatestPayslipBundleForUser,
    getCurrentCompensationFromSalaryStructure,
    getPayslipBreakdown,
} from "../utils/payslip.utils.js";
import {
    hasStoredLoginCredentials,
    credentialAccountsInclude,
} from "../utils/loginCredentials.util.js";
import {
    VALID_EMPLOYMENT_STATUSES,
    EMPLOYEE_STATUSES_ACTIVE_FOR_WORK,
    isEmployeeActiveForWork,
} from "../utils/employee-status.util.js";
import { getDepartmentFilter } from "../utils/access-control.utils.js";

/** Map breakdown rows to a safe JSON shape for payroll overview. */
function toPayrollOverviewLines(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => ({
        name: String(r?.name ?? "").trim() || "Item",
        amount: Math.round((Number(r?.amount) || 0) * 100) / 100,
    }));
}

function sumLineAmounts(lines) {
    return Math.round(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) * 100) / 100;
}

const BANK_NAME_MAX_LEN = 120;
const ACCOUNT_NUMBER_MAX_LEN = 64;

/** Trim and cap length; empty string becomes null for optional bank fields. */
function normalizeOptionalBankField(val, maxLen) {
    if (val == null) return null;
    const s = String(val).trim();
    if (!s) return null;
    return s.slice(0, maxLen);
}

function normalizeBankFieldsOnUpdateObject(obj) {
    if (!obj) return;
    if (Object.prototype.hasOwnProperty.call(obj, "bankName")) {
        obj.bankName = normalizeOptionalBankField(obj.bankName, BANK_NAME_MAX_LEN);
    }
    if (Object.prototype.hasOwnProperty.call(obj, "accountNumber")) {
        obj.accountNumber = normalizeOptionalBankField(obj.accountNumber, ACCOUNT_NUMBER_MAX_LEN);
    }
}

function canAccessEmployeeDocument(requesterRole, requesterId, targetEmployeeId, hasEffectiveTenant) {
    const canViewOtherEmployees =
        ["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"].includes(requesterRole) ||
        (requesterRole === "SUPER_ADMIN" && hasEffectiveTenant);
    return targetEmployeeId === requesterId || canViewOtherEmployees;
}

function parseDocumentExtension(originalName, mimeType) {
    if (typeof originalName === "string" && originalName.includes(".")) {
        const ext = originalName.split(".").pop()?.trim().toLowerCase();
        if (ext) return ext;
    }
    if (typeof mimeType === "string" && mimeType.includes("/")) {
        return mimeType.split("/")[1]?.toLowerCase() || null;
    }
    return null;
}

/**
 * End any currently-active salary structures for a user.
 * Active = effectiveDate <= asOf AND (endDate is null OR endDate >= asOf)
 */
async function endActiveSalaryStructuresForUser(tx, tenantId, userId, asOf) {
    const result = await tx.salaryStructure.updateMany({
        where: {
            tenantId,
            userId,
            effectiveDate: { lte: asOf },
            OR: [{ endDate: null }, { endDate: { gte: asOf } }],
        },
        data: {
            endDate: asOf,
        },
    });
    return result.count ?? 0;
}

// get all employees
export const getAllEmployees = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const {
            sortBy = "createdAt",
            sortOrder = "desc",
            search,
            departmentId,
            status,
            page = 1,
            limit = 10,
        } = req.query;
        const normalizedOrder = String(sortOrder).toLowerCase() === "asc" ? "asc" : "desc";
        const currentPage = Math.max(1, parseInt(page, 10) || 1);
        const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (currentPage - 1) * perPage;

        // tenant scope
        const where = {
            isDeleted: false,
            ...(tenantId && { tenantId }),
        };

        const deptFilter = await getDepartmentFilter(req.user);
        const isDeptScoped = Object.keys(deptFilter).length > 0;

        if (isDeptScoped) {
            // DEPARTMENT_ADMIN: enforce managed-department scope; ignore query param
            Object.assign(where, deptFilter);
        } else if (departmentId) {
            // HR roles: optional departmentId filter from query param
            where.departmentId = String(departmentId);
        }

        if (status) {
            const normalizedStatus = String(status).toUpperCase();
            if (normalizedStatus === "ACTIVE") {
                where.status = { in: EMPLOYEE_STATUSES_ACTIVE_FOR_WORK };
            } else if (VALID_EMPLOYMENT_STATUSES.includes(normalizedStatus)) {
                where.status = normalizedStatus;
            }
        }

        if (search && String(search).trim()) {
            const searchTerm = String(search).trim();
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { name: { contains: searchTerm, mode: "insensitive" } },
                        { email: { contains: searchTerm, mode: "insensitive" } },
                    ],
                },
            ];
        }

        let orderBy = [{ createdAt: "desc" }];
        if (sortBy === "name") {
            orderBy = [{ name: normalizedOrder }, { createdAt: "desc" }];
        } else if (sortBy === "department") {
            orderBy = [{ department: { name: normalizedOrder } }, { createdAt: "desc" }];
        } else if (sortBy === "hireDate") {
            orderBy = [{ hireDate: normalizedOrder }, { createdAt: "desc" }];
        } else if (sortBy === "createdAt") {
            orderBy = [{ createdAt: normalizedOrder }];
        }

        const [employees, total] = await Promise.all([
            prisma.user.findMany({
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
                    accounts: credentialAccountsInclude,
                },
                orderBy,
                skip,
                take: perPage,
            }),
            prisma.user.count({ where }),
        ]);

        const employeeIds = employees.map((employee) => employee.id);
        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);

        const openAttendancesToday = employeeIds.length
            ? await prisma.attendance.findMany({
                where: {
                    ...(tenantId && { tenantId }),
                    userId: { in: employeeIds },
                    clockInTime: {
                        gte: dayStart,
                        lte: dayEnd,
                    },
                    clockOutTime: null,
                },
                select: {
                    userId: true,
                },
            })
            : [];
        const excusedAbsencesToday = employeeIds.length
            ? await prisma.attendanceException.findMany({
                where: {
                    ...(tenantId && { tenantId }),
                    userId: { in: employeeIds },
                    type: "EXCUSED_ABSENCE",
                    isActive: true,
                    date: {
                        gte: dayStart,
                        lte: dayEnd,
                    },
                },
                select: {
                    userId: true,
                },
            })
            : [];

        const clockedInTodaySet = new Set(openAttendancesToday.map((attendance) => attendance.userId));
        const excusedTodaySet = new Set(excusedAbsencesToday.map((item) => item.userId));

        // Remove sensitive information (password, account hashes) from response
        const sanitizedEmployees = employees.map((employee) => {
            const { password, accounts, ...employeeWithoutPassword } = employee;
            return {
                ...employeeWithoutPassword,
                setupInviteEligible: !hasStoredLoginCredentials(password, accounts),
                isClockedInToday: clockedInTodaySet.has(employee.id),
                hasExcusedAbsenceToday: excusedTodaySet.has(employee.id),
            };
        });

        logger.info(`Retrieved ${sanitizedEmployees.length} employees`);
        const totalPages = Math.max(1, Math.ceil(total / perPage));

        return res.status(200).json({
            success: true,
            data: sanitizedEmployees,
            count: sanitizedEmployees.length,
            pagination: {
                page: currentPage,
                limit: perPage,
                total,
                totalPages,
            },
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

const MAX_EMPLOYEE_EXPORT = 10000;

export const exportEmployees = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const {
            sortBy = "createdAt",
            sortOrder = "desc",
            ids,
            departmentId,
            status,
            search,
        } = req.query;
        const normalizedOrder = String(sortOrder).toLowerCase() === "asc" ? "asc" : "desc";

        const where = {
            isDeleted: false,
            ...(tenantId && { tenantId }),
        };

        if (ids && String(ids).trim()) {
            const idList = String(ids)
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean);
            if (idList.length > 0) where.id = { in: idList };
        } else {
            if (departmentId) {
                where.departmentId = String(departmentId);
            }

            if (status) {
                const normalizedStatus = String(status).toUpperCase();
                if (normalizedStatus === "ACTIVE") {
                    where.status = { in: EMPLOYEE_STATUSES_ACTIVE_FOR_WORK };
                } else if (VALID_EMPLOYMENT_STATUSES.includes(normalizedStatus)) {
                    where.status = normalizedStatus;
                }
            }

            if (search && String(search).trim()) {
                const searchTerm = String(search).trim();
                where.AND = [
                    ...(where.AND || []),
                    {
                        OR: [
                            { name: { contains: searchTerm, mode: "insensitive" } },
                            { email: { contains: searchTerm, mode: "insensitive" } },
                        ],
                    },
                ];
            }
        }

        const total = await prisma.user.count({ where });
        if (total === 0) {
            return res.status(404).json({
                success: false,
                message: "No employees match the current filters.",
            });
        }
        if (total > MAX_EMPLOYEE_EXPORT) {
            return res.status(400).json({
                success: false,
                message: `Too many employees (${total}) to export. Narrow filters or export at most ${MAX_EMPLOYEE_EXPORT}.`,
            });
        }

        let orderBy = [{ createdAt: "desc" }];
        if (sortBy === "name") {
            orderBy = [{ name: normalizedOrder }, { createdAt: "desc" }];
        } else if (sortBy === "department") {
            orderBy = [{ department: { name: normalizedOrder } }, { createdAt: "desc" }];
        } else if (sortBy === "hireDate") {
            orderBy = [{ hireDate: normalizedOrder }, { createdAt: "desc" }];
        } else if (sortBy === "createdAt") {
            orderBy = [{ createdAt: normalizedOrder }];
        }

        const employees = await prisma.user.findMany({
            where,
            include: {
                department: { select: { name: true } },
                position: { select: { title: true } },
            },
            orderBy,
            take: MAX_EMPLOYEE_EXPORT,
        });

        const headers = [
            "Employee",
            "Employee ID",
            "Date Joined",
            "Department",
            "Role",
            "Email",
            "Status",
            "Bank name",
            "Account number",
        ];
        const rows = employees.map((employee) => [
            escapeCsv(employee.name),
            escapeCsv(employee.employeeId),
            escapeCsv(formatDateForCsv(employee.hireDate ?? employee.createdAt)),
            escapeCsv(employee.department?.name ?? ""),
            escapeCsv(employee.position?.title ?? ""),
            escapeCsv(employee.email ?? ""),
            escapeCsv(employee.status ?? ""),
            escapeCsv(employee.bankName ?? ""),
            escapeCsv(employee.accountNumber ?? ""),
        ]);
        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

        const filename = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).send(csv);
    } catch (error) {
        logger.error(`Error exporting employees: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to export employees",
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

        const allowedRoles = ["HR_ADMIN", "HR_STAFF"];
        const canCreate =
            allowedRoles.includes(actorRole) ||
            (actorRole === "SUPER_ADMIN" && req.effectiveTenantId);
        if (!canCreate) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "Only HR users can create employees",
            });
        }

        const result = await createEmployeeInternal({
            tenantId,
            actorRole,
            body: req.body,
        });

        if (!result.ok) {
            return res.status(result.statusCode).json({
                success: false,
                error:
                    result.statusCode === 409
                        ? "Conflict"
                        : result.statusCode === 404
                            ? "Not Found"
                            : "Bad Request",
                message: result.message,
            });
        }

        return res.status(201).json({
            success: true,
            data: result.user,
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
        const requesterId = req.user?.id;
        const requesterRole = req.user?.role;
        const requestedId = req.params?.id;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const canViewOtherEmployees =
            ["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"].includes(requesterRole) ||
            (requesterRole === "SUPER_ADMIN" && req.effectiveTenantId);
        const targetEmployeeId = requestedId || requesterId;

        if (!targetEmployeeId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (requestedId && requestedId !== requesterId && !canViewOtherEmployees) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only view your own profile",
            });
        }

        const where = {
            id: targetEmployeeId,
            isDeleted: false,
            ...(tenantId && { tenantId }),
        };

        // Fetch employee with related data
        const employee = await prisma.user.findFirst({
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
                shift: {
                    select: {
                        id: true,
                        name: true,
                        startTime: true,
                        endTime: true,
                        isDefault: true,
                        isActive: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                accounts: credentialAccountsInclude,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found with ID: ${targetEmployeeId}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(now);
        dayEnd.setHours(23, 59, 59, 999);

        const [openAttendanceToday, excusedAbsenceToday] = await Promise.all([
            prisma.attendance.findFirst({
                where: {
                    ...(tenantId && { tenantId }),
                    userId: employee.id,
                    clockInTime: {
                        gte: dayStart,
                        lte: dayEnd,
                    },
                    clockOutTime: null,
                },
                select: { id: true },
            }),
            prisma.attendanceException.findFirst({
                where: {
                    ...(tenantId && { tenantId }),
                    userId: employee.id,
                    type: "EXCUSED_ABSENCE",
                    isActive: true,
                    date: {
                        gte: dayStart,
                        lte: dayEnd,
                    },
                },
                select: { id: true },
            }),
        ]);

        // Remove sensitive information (password, account hashes) from response
        const { password, accounts, ...sanitizedEmployee } = employee;

        logger.info(`Retrieved employee with ID: ${targetEmployeeId}`);

        return res.status(200).json({
            success: true,
            data: {
                ...sanitizedEmployee,
                isClockedInToday: Boolean(openAttendanceToday),
                hasExcusedAbsenceToday: Boolean(excusedAbsenceToday),
                setupInviteEligible: !hasStoredLoginCredentials(password, accounts),
            },
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
            "address",
            "addressLine1",
            "addressLine2",
            "gender",
            "dateOfBirth",
            "SSN",
            "tinNumber",
            "bankName",
            "accountNumber",
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

        normalizeBankFieldsOnUpdateObject(filteredData);

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
                accounts: credentialAccountsInclude,
            },
        });

        // Remove sensitive information (password, account hashes) from response
        const { password, accounts, ...sanitizedEmployee } = updatedEmployee;

        return res.status(200).json({
            success: true,
            data: {
                ...sanitizedEmployee,
                setupInviteEligible: !hasStoredLoginCredentials(password, accounts),
            },
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
            "email",
            "phone",
            "address",
            "gender",
            "dateOfBirth",
            "SSN",
            "tinNumber",
            "bankName",
            "accountNumber",
            "image",
            "departmentId",
            "positionId",
            "shiftId",
            "status",
            "employmentType",
            "hireDate",
            "role",
            "workLocation",
        ];

        // Filter out disallowed fields and build update object
        const filteredData = {};
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                filteredData[field] = updateData[field];
            }
        }

        normalizeBankFieldsOnUpdateObject(filteredData);

        // If no valid fields to update
        if (Object.keys(filteredData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        // Role changes: prevent privilege escalation and self-role edits
        if (filteredData.role !== undefined) {
            const actorRole = req.user?.role;
            const newRole = filteredData.role;
            const previousRole = existingEmployee.role;

            if (newRole === "SUPER_ADMIN") {
                return res.status(403).json({
                    success: false,
                    error: "Forbidden",
                    message: "Super admin role cannot be assigned through this endpoint",
                });
            }

            if (actorId === id) {
                if (newRole === previousRole) {
                    delete filteredData.role;
                } else {
                    return res.status(403).json({
                        success: false,
                        error: "Forbidden",
                        message: "You cannot change your own role",
                    });
                }
            }

            if (actorRole === "HR_STAFF") {
                const staffAssignable = ["STAFF", "DEPARTMENT_ADMIN"];
                if (!staffAssignable.includes(newRole)) {
                    return res.status(403).json({
                        success: false,
                        error: "Forbidden",
                        message: "You can only assign Staff or Department admin roles",
                    });
                }
                if (previousRole === "HR_ADMIN" || previousRole === "HR_STAFF") {
                    return res.status(403).json({
                        success: false,
                        error: "Forbidden",
                        message: "Only an HR administrator can change roles for HR administrators and HR staff",
                    });
                }
            }
        }

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

        if (filteredData.shiftId !== undefined) {
            if (filteredData.shiftId === "" || filteredData.shiftId === null) {
                filteredData.shiftId = null;
            } else {
                const shift = await prisma.shift.findFirst({
                    where: {
                        id: filteredData.shiftId,
                        tenantId,
                        isActive: true,
                    },
                });
                if (!shift) {
                    return res.status(400).json({
                        success: false,
                        error: "Bad Request",
                        message: "Invalid or inactive shift ID",
                    });
                }
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
                shift: {
                    select: {
                        id: true,
                        name: true,
                        startTime: true,
                        endTime: true,
                        isDefault: true,
                        isActive: true,
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
        const targetEmployeeId = req.params.id;
        const actorId = req.user.id;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { reason } = req.body ?? {};
        const normalizedReason = String(reason ?? "").toUpperCase();
        const validTerminationReasons = ["FIRED", "RESIGNED"];

        if (!targetEmployeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee ID is required",
            });
        }

        if (!actorId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (!validTerminationReasons.includes(normalizedReason)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Termination reason is required and must be FIRED or RESIGNED",
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
                id: targetEmployeeId,
                tenantId,
                isDeleted: false,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for termination with ID: ${targetEmployeeId}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Check if employee is already inactive
        if (employee.status === "INACTIVE") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee is already inactive",
            });
        }

        const now = new Date();
        const { terminatedEmployee, endedSalaryStructures } = await prisma.$transaction(async (tx) => {
            const endedCount = await endActiveSalaryStructuresForUser(
                tx,
                tenantId,
                targetEmployeeId,
                now
            );

            const updatedEmployee = await tx.user.update({
                where: {
                    id: targetEmployeeId,
                    tenantId,
                },
                data: {
                    status: "INACTIVE",
                    terminationReason: normalizedReason,
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

            return { terminatedEmployee: updatedEmployee, endedSalaryStructures: endedCount };
        });

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = terminatedEmployee;

        logger.info(`Terminated employee with ID: ${targetEmployeeId}`);
        const changes = getChangesDiff(employee, terminatedEmployee);
        await addLog(actorId, tenantId, "TERMINATE", "Employee", targetEmployeeId, changes, req);

        return res.status(200).json({
            success: true,
            data: {
                ...sanitizedEmployee,
                payroll: {
                    endedActiveSalaryStructures: endedSalaryStructures,
                },
            },
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
        const targetEmployeeId = req.params.id;
        const actorId = req.user.id;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        if (!targetEmployeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee ID is required",
            });
        }

        if (!actorId) {
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
                id: targetEmployeeId,
                tenantId,
                isDeleted: false,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for reactivation with ID: ${targetEmployeeId}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Check if employee is already active (includes probation — treated as active for work)
        if (isEmployeeActiveForWork(employee.status)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee is already active",
            });
        }

        // Reactivate employee (set status to ACTIVE)
        const reactivatedEmployee = await prisma.user.update({
            where: {
                id: targetEmployeeId,
                tenantId,
            },
            data: {
                status: "ACTIVE",
                terminationReason: null,
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

        logger.info(`Reactivated employee with ID: ${targetEmployeeId}`);
        const changes = getChangesDiff(employee, reactivatedEmployee);
        await addLog(actorId, tenantId, "REACTIVATE", "Employee", targetEmployeeId, changes, req);

        return res.status(200).json({
            success: true,
            data: {
                ...sanitizedEmployee,
                payroll: {
                    salaryStructureAction: "NONE",
                    note: "Salary structures are not auto-reactivated on rehire. Create a new salary structure effective from rehire date.",
                },
            },
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
        const targetEmployeeId = req.params.id;
        const actorId = req.user.id;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        if (!targetEmployeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee ID is required",
            });
        }

        if (!actorId) {
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
                id: targetEmployeeId,
                tenantId,
                isDeleted: false,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for archiving with ID: ${targetEmployeeId}`);
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
                id: targetEmployeeId,
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

        logger.info(`Archived employee with ID: ${targetEmployeeId}`);
        const changes = getChangesDiff(employee, archivedEmployee);
        await addLog(actorId, tenantId, "ARCHIVE", "Employee", targetEmployeeId, changes, req);

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
        const targetEmployeeId = req.params.id;
        const actorId = req.user.id;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        if (!targetEmployeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee ID is required",
            });
        }

        if (!actorId) {
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
                id: targetEmployeeId,
                tenantId,
            },
        });

        if (!employee) {
            logger.warn(`Employee not found for restoration with ID: ${targetEmployeeId}`);
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
                id: targetEmployeeId,
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

        logger.info(`Restored employee with ID: ${targetEmployeeId}`);
        const changes = getChangesDiff(employee, restoredEmployee);
        await addLog(actorId, tenantId, "RESTORE", "Employee", targetEmployeeId, changes, req);

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

/**
 * GET /api/employees/:id/payroll-overview
 * Payroll tab: stat cards (YTD, latest net, compensation), itemized allowances/deductions
 * from latest payslip breakdown, or projected from current salary structure when no payslip.
 */
export const getEmployeePayrollOverview = async (req, res) => {
    try {
        const requesterId = req.user?.id;
        const requesterRole = req.user?.role;
        const employeeId = req.params?.id;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const canViewOtherEmployees =
            ["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"].includes(requesterRole) ||
            (requesterRole === "SUPER_ADMIN" && req.effectiveTenantId);

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee id is required",
            });
        }

        if (employeeId !== requesterId && !canViewOtherEmployees) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only view your own payroll overview",
            });
        }

        const employee = await prisma.user.findFirst({
            where: {
                id: employeeId,
                isDeleted: false,
                ...(tenantId && { tenantId }),
            },
            select: { id: true, employeeId: true },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        const [bundle, compensationFromStructure] = await Promise.all([
            getLatestPayslipBundleForUser(employeeId, tenantId),
            getCurrentCompensationFromSalaryStructure(employeeId, tenantId),
        ]);

        let compensation = compensationFromStructure;
        if (!compensation && bundle.breakdown) {
            compensation = {
                baseSalaryMonthly: bundle.breakdown.baseSalary ?? 0,
                salaryPeriodType: "MONTHLY",
                payFrequencyLabel: "Monthly",
                currency: bundle.breakdown.currency || "GMD",
            };
        }

        const hasPayrollHistory = bundle.payslip != null;
        const ytd = bundle.ytd
            ? {
                  grossEarnings: bundle.ytd.grossSalaryYTD,
                  netPay: bundle.ytd.netSalaryYTD,
                  totalDeductions: bundle.ytd.totalDeductionsYTD,
                  overtimePayYTD: bundle.ytd.overtimePayYTD ?? 0,
                  overtimeHoursYTD: bundle.ytd.overtimeHoursYTD ?? 0,
              }
            : null;

        const overtime =
            bundle.breakdown?.overtime && typeof bundle.breakdown.overtime === "object"
                ? {
                      latestPayAmount: Math.round((Number(bundle.breakdown.overtime.amount) || 0) * 100) / 100,
                      latestPayHours: Math.round((Number(bundle.breakdown.overtime.hours) || 0) * 100) / 100,
                      multiplier:
                          bundle.breakdown.overtime.multiplier != null
                              ? Number(bundle.breakdown.overtime.multiplier)
                              : null,
                  }
                : null;

        const latest = bundle.payslip
            ? {
                  netPay: bundle.netSalary,
                  grossSalary: Math.round((Number(bundle.payslip.grossSalary) || 0) * 100) / 100,
                  periodName: bundle.payslip.payrollRun.payPeriod.periodName,
                  periodStartDate: bundle.payslip.payrollRun.payPeriod.startDate,
                  periodEndDate: bundle.payslip.payrollRun.payPeriod.endDate,
              }
            : null;

        const currency =
            compensation?.currency || bundle.breakdown?.currency || "GMD";

        let latestBreakdown = null;
        if (bundle.payslip && bundle.breakdown) {
            const allowances = toPayrollOverviewLines(bundle.breakdown.allowances);
            const deductions = toPayrollOverviewLines(bundle.breakdown.deductions);
            const slip = bundle.payslip;
            latestBreakdown = {
                source: "PAYSLIP",
                allowances,
                deductions,
                totalAllowances: Math.round(
                    (Number(slip.totalAllowances) || sumLineAmounts(allowances)) * 100
                ) / 100,
                totalDeductions: Math.round(
                    (Number(slip.totalDeductions) || sumLineAmounts(deductions)) * 100
                ) / 100,
            };
        } else if (compensationFromStructure) {
            const now = new Date();
            const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            const proj = await getPayslipBreakdown(
                employeeId,
                tenantId,
                periodStart,
                periodEnd
            );
            const allowances = toPayrollOverviewLines(proj?.allowances);
            const deductions = toPayrollOverviewLines(proj?.deductions);
            if (allowances.length > 0 || deductions.length > 0) {
                latestBreakdown = {
                    source: "SALARY_STRUCTURE",
                    allowances,
                    deductions,
                    totalAllowances: sumLineAmounts(allowances),
                    totalDeductions: sumLineAmounts(deductions),
                    note: "Estimated from current salary structure (no payslip yet).",
                    ...(proj?.overtimeProjectionNote && { overtimeProjectionNote: proj.overtimeProjectionNote }),
                };
            }
        }

        await addLog(
            requesterId,
            tenantId,
            "VIEW",
            "Employee",
            employeeId,
            {
                action: "view_payroll_overview",
                employeeCode: employee.employeeId,
            },
            req
        );

        logger.info(`Payroll overview for employee ${employeeId} (requester ${requesterId})`);

        return res.status(200).json({
            success: true,
            data: {
                currency,
                hasPayrollHistory,
                ytd,
                latest,
                compensation,
                latestBreakdown,
                overtime,
            },
        });
    } catch (error) {
        logger.error(`getEmployeePayrollOverview: ${error.message}`, {
            stack: error.stack,
            employeeId: req.params?.id,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to load payroll overview",
        });
    }
};

export const getEmployeeDocuments = async (req, res) => {
    try {
        const requesterId = req.user?.id;
        const requesterRole = req.user?.role;
        const tenantId = req.effectiveTenantId ?? req.user?.tenantId;
        const targetEmployeeId = req.params?.id; 

        if (!targetEmployeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee id is required",
            });
        }

        if (
            !canAccessEmployeeDocument(
                requesterRole,
                requesterId,
                targetEmployeeId,
                Boolean(req.effectiveTenantId)
            )
        ) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only view your own documents",
            });
        }

        const employee = await prisma.user.findFirst({
            where: {
                id: targetEmployeeId,
                isDeleted: false,
                ...(tenantId && { tenantId }),
            },
            select: { id: true },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        const documents = await prisma.employeeDocument.findMany({
            where: {
                userId: targetEmployeeId,
                ...(tenantId && { tenantId }),
            },
            orderBy: [{ createdAt: "desc" }],
        });

        return res.status(200).json({
            success: true,
            data: documents,
            count: documents.length,
        });
    } catch (error) {
        logger.error(`Error fetching employee documents: ${error.message}`, {
            error: error.stack,
            employeeId: req.params?.id,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch employee documents",
        });
    }
};

export const uploadEmployeeDocument = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user?.tenantId;
        const actorId = req.user?.id;
        const targetEmployeeId = req.params?.id;

        if (!targetEmployeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee id is required",
            });
        }

        const files = Array.isArray(req.files)
            ? req.files
            : req.file
                ? [req.file]
                : [];

        if (files.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No documents uploaded",
            });
        }

        const employee = await prisma.user.findFirst({
            where: {
                id: targetEmployeeId,
                isDeleted: false,
                ...(tenantId && { tenantId }),
            },
            select: { id: true },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        const uploadedDocuments = [];
        for (const file of files) {
            const storedName = generateFilename(
                file.originalname,
                `employee-documents/${tenantId}/${targetEmployeeId}`
            );
            const filePath = await uploadFile(file.buffer, storedName, file.mimetype);
            const extension = parseDocumentExtension(file.originalname, file.mimetype);

            const document = await prisma.employeeDocument.create({
                data: {
                    tenantId,
                    userId: targetEmployeeId,
                    originalName: file.originalname,
                    storedName,
                    filePath,
                    mimeType: file.mimetype,
                    extension,
                    sizeBytes: file.size,
                    uploadedBy: actorId,
                },
            });
            uploadedDocuments.push(document);

            await addLog(actorId, tenantId, "CREATE", "EmployeeDocument", document.id, {
                employeeId: targetEmployeeId,
                originalName: document.originalName,
                sizeBytes: document.sizeBytes,
            }, req);
        }

        return res.status(201).json({
            success: true,
            data: uploadedDocuments,
            count: uploadedDocuments.length,
            message:
                uploadedDocuments.length === 1
                    ? "Employee document uploaded successfully"
                    : "Employee documents uploaded successfully",
        });
    } catch (error) {
        logger.error(`Error uploading employee document: ${error.message}`, {
            error: error.stack,
            employeeId: req.params?.id,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to upload employee document",
        });
    }
};

export const downloadEmployeeDocument = async (req, res) => {
    try {
        const requesterId = req.user?.id;
        const requesterRole = req.user?.role;
        const tenantId = req.effectiveTenantId ?? req.user?.tenantId;
        const targetEmployeeId = req.params?.id;
        const documentId = req.params?.documentId;

        if (!targetEmployeeId || !documentId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee id and document id are required",
            });
        }

        if (
            !canAccessEmployeeDocument(
                requesterRole,
                requesterId,
                targetEmployeeId,
                Boolean(req.effectiveTenantId)
            )
        ) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only access your own documents",
            });
        }

        const document = await prisma.employeeDocument.findFirst({
            where: {
                id: documentId,
                userId: targetEmployeeId,
                ...(tenantId && { tenantId }),
            },
        });

        if (!document) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Document not found",
            });
        }

        const fileBuffer = await getFile(document.storedName);
        res.setHeader("Content-Type", document.mimeType || "application/octet-stream");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${document.originalName.replace(/"/g, "")}"`
        );
        return res.status(200).send(fileBuffer);
    } catch (error) {
        logger.error(`Error downloading employee document: ${error.message}`, {
            error: error.stack,
            employeeId: req.params?.id,
            documentId: req.params?.documentId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to download employee document",
        });
    }
};

export const deleteEmployeeDocument = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user?.tenantId;
        const actorId = req.user?.id;
        const targetEmployeeId = req.params?.id;
        const documentId = req.params?.documentId;

        if (!targetEmployeeId || !documentId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Employee id and document id are required",
            });
        }

        const document = await prisma.employeeDocument.findFirst({
            where: {
                id: documentId,
                userId: targetEmployeeId,
                ...(tenantId && { tenantId }),
            },
        });

        if (!document) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Document not found",
            });
        }

        await prisma.employeeDocument.delete({
            where: { id: document.id },
        });

        try {
            const storageKey = extractFilenameFromUrl(document.filePath) || document.storedName;
            if (storageKey) await deleteFile(storageKey);
        } catch (deleteErr) {
            logger.warn(`Could not delete employee document file: ${deleteErr.message}`);
        }

        await addLog(actorId, tenantId, "DELETE", "EmployeeDocument", document.id, {
            employeeId: targetEmployeeId,
            originalName: document.originalName,
        }, req);

        return res.status(200).json({
            success: true,
            message: "Employee document deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting employee document: ${error.message}`, {
            error: error.stack,
            employeeId: req.params?.id,
            documentId: req.params?.documentId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete employee document",
        });
    }
};