import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";
import { parseFlexibleDate } from "../utils/date-parser.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_EMPLOYMENT_STATUSES = ["INACTIVE", "ACTIVE", "ON_LEAVE"];
const VALID_EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
const validRoles = ["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"];

/**
 * Same validation as createEmployeeInternal up to (but not including) user create.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function validateEmployeeCreationPayload({ tenantId, actorRole, body }) {
    const {
        name,
        email,
        role,
        departmentId,
        positionId,
        dateOfBirth,
        employmentStatus,
        employmentType,
        hireDate,
        baseSalary,
        salaryPeriodType,
        salaryEffectiveDate,
    } = body || {};

    const allowedRoles = ["HR_ADMIN", "HR_STAFF"];
    const canCreate = allowedRoles.includes(actorRole) || actorRole === "SUPER_ADMIN";
    if (!canCreate) {
        return { ok: false, message: "Only HR users can create employees" };
    }

    if (!name || typeof name !== "string" || !name.trim()) {
        return { ok: false, message: "Name is required" };
    }
    if (!email || typeof email !== "string" || !email.trim()) {
        return { ok: false, message: "Email is required" };
    }
    if (!emailRegex.test(email)) {
        return { ok: false, message: "Invalid email format" };
    }
    if (role && !validRoles.includes(role)) {
        return {
            ok: false,
            message: "Invalid role. Must be one of: HR_ADMIN, HR_STAFF, STAFF, DEPARTMENT_ADMIN",
        };
    }

    if (departmentId) {
        const department = await prisma.department.findFirst({
            where: { id: departmentId, tenantId, deletedAt: null },
        });
        if (!department) {
            return {
                ok: false,
                message: "Department not found or does not belong to this tenant",
            };
        }
    }

    if (positionId) {
        const position = await prisma.position.findFirst({
            where: { id: positionId, tenantId, deletedAt: null },
        });
        if (!position) {
            return {
                ok: false,
                message: "Position not found or does not belong to this tenant",
            };
        }
    }

    if (employmentStatus != null && employmentStatus !== "") {
        if (!VALID_EMPLOYMENT_STATUSES.includes(employmentStatus)) {
            return {
                ok: false,
                message: `Invalid employment status. Must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}`,
            };
        }
    }
    if (employmentType != null && employmentType !== "") {
        if (!VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
            return {
                ok: false,
                message: `Invalid employment type. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}`,
            };
        }
    }

    if (baseSalary == null || baseSalary === "") {
        return { ok: false, message: "Base salary is required" };
    }
    const baseSalaryNum = Number(baseSalary);
    if (Number.isNaN(baseSalaryNum) || baseSalaryNum <= 0) {
        return { ok: false, message: "Base salary must be a positive number" };
    }

    if (salaryPeriodType != null && String(salaryPeriodType).trim() !== "") {
        const validPeriodTypes = ["MONTHLY", "ANNUAL"];
        if (!validPeriodTypes.includes(String(salaryPeriodType).toUpperCase())) {
            return { ok: false, message: "salary period type must be MONTHLY or ANNUAL" };
        }
    }

    if (dateOfBirth != null && String(dateOfBirth).trim() !== "") {
        const dob = parseFlexibleDate(dateOfBirth);
        if (!dob) {
            return { ok: false, message: "Invalid date of birth" };
        }
    }
    if (hireDate != null && String(hireDate).trim() !== "") {
        const hd = parseFlexibleDate(hireDate);
        if (!hd) {
            return { ok: false, message: "Invalid hire date" };
        }
    }
    if (salaryEffectiveDate != null && String(salaryEffectiveDate).trim() !== "") {
        const sd = parseFlexibleDate(salaryEffectiveDate);
        if (!sd) {
            return { ok: false, message: "Invalid salary effective date" };
        }
    }

    const existingUser = await prisma.user.findFirst({
        where: { email, tenantId, isDeleted: false },
    });
    if (existingUser) {
        return { ok: false, message: "User with this email already exists in this tenant" };
    }

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
    });
    if (!tenant) {
        return { ok: false, message: "Tenant not found" };
    }

    return { ok: true };
}

/**
 * Create employee (same rules as POST /employees). Used by batch and HTTP controller.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.actorRole
 * @param {object} params.body - same shape as req.body for createEmployee
 * @returns {Promise<{ ok: true, user: object } | { ok: false, statusCode: number, message: string }>}
 */
export async function createEmployeeInternal({ tenantId, actorRole, body }) {
    const {
        name,
        email,
        role,
        departmentId,
        positionId,
        dateOfBirth,
        employmentStatus,
        employmentType,
        hireDate,
        baseSalary,
        salaryPeriodType,
        salaryEffectiveDate,
        salaryCurrency,
    } = body || {};

    const pre = await validateEmployeeCreationPayload({ tenantId, actorRole, body });
    if (!pre.ok) {
        const code =
            pre.message.includes("already exists") ? 409 : pre.message.includes("Only HR") ? 403 : 400;
        return { ok: false, statusCode: code, message: pre.message };
    }

    const validPeriodTypes = ["MONTHLY", "ANNUAL"];
    const salaryPeriodTypeVal =
        salaryPeriodType != null && validPeriodTypes.includes(String(salaryPeriodType).toUpperCase())
            ? String(salaryPeriodType).toUpperCase()
            : "MONTHLY";

    const salaryCurrencyVal =
        salaryCurrency != null && String(salaryCurrency).trim() !== ""
            ? String(salaryCurrency).trim()
            : "GMD";

    const hireDateParsed = hireDate ? parseFlexibleDate(hireDate) : null;
    const dateOfBirthParsed = dateOfBirth ? parseFlexibleDate(dateOfBirth) : null;
    const salaryEffectiveDateParsed = salaryEffectiveDate ? parseFlexibleDate(salaryEffectiveDate) : null;

    const baseSalaryNum = Number(baseSalary);

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, code: true },
    });

    let department = null;
    if (departmentId) {
        department = await prisma.department.findFirst({
            where: { id: departmentId, tenantId, deletedAt: null },
        });
    }

    const employeeIdStr = await generateEmployeeId(tenantId, tenant, department);

    const newUser = await prisma.user.create({
        data: {
            tenantId,
            email,
            password: null,
            name: name.trim(),
            emailVerified: false,
            role: role || "STAFF",
            employeeId: employeeIdStr,
            departmentId: departmentId || null,
            positionId: positionId || null,
            dateOfBirth: dateOfBirthParsed,
            status: employmentStatus || "ACTIVE",
            employmentType: employmentType || "FULL_TIME",
            hireDate: hireDateParsed,
        },
        include: {
            department: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
            tenant: { select: { id: true, name: true, code: true } },
        },
    });

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
        logger.error(`Failed to create salary structure for employee ${newUser.id}: ${salaryError.message}`, {
            error: salaryError.stack,
        });
    }

    const { password, ...sanitized } = newUser;
    logger.info(`Created employee ${sanitized.id} (${sanitized.email}) for tenant ${tenantId}`);
    return { ok: true, user: sanitized };
}
