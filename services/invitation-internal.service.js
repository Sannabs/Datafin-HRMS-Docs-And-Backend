import crypto from "crypto";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { sendInvitationEmail } from "../views/sendInvitationEmail.js";
import { parseFlexibleDate } from "../utils/date-parser.js";
import {
    hasStoredLoginCredentials,
    credentialAccountsInclude,
    normalizeAuthEmail,
} from "../utils/loginCredentials.util.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_EMPLOYMENT_STATUSES = ["INACTIVE", "ACTIVE", "ON_LEAVE"];
const VALID_EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
const validRoles = ["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"];

/**
 * Validation only (no invitation row, no email). Mirrors createInvitationInternal checks before create.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function validateInvitationPayload({ tenantId, senderRole, body }) {
    const {
        email,
        role,
        departmentId,
        positionId,
        dateOfBirth,
        hireDate,
        employmentStatus,
        employmentType,
        baseSalary,
        salaryPeriodType,
        salaryEffectiveDate,
    } = body || {};

    if (!email) {
        return { ok: false, message: "Email is required" };
    }
    if (!emailRegex.test(email)) {
        return { ok: false, message: "Invalid email format" };
    }

    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail) {
        return { ok: false, message: "Invalid email format" };
    }

    if (!role) {
        return { ok: false, message: "Role is required" };
    }
    if (!validRoles.includes(role)) {
        return {
            ok: false,
            message: "Invalid role. Must be one of: HR_ADMIN, HR_STAFF, STAFF, DEPARTMENT_ADMIN",
        };
    }

    const canSend = senderRole === "HR_ADMIN" || senderRole === "SUPER_ADMIN";
    if (!canSend) {
        return { ok: false, message: "Only HR_ADMIN can send invitations" };
    }

    if (departmentId) {
        const department = await prisma.department.findFirst({
            where: { id: departmentId, tenantId, deletedAt: null },
        });
        if (!department) {
            return { ok: false, message: "Department not found or does not belong to this tenant" };
        }
        if (role === "DEPARTMENT_ADMIN" && department.managerId) {
            const existingManager = await prisma.user.findFirst({
                where: {
                    id: department.managerId,
                    tenantId,
                    isDeleted: false,
                    status: "ACTIVE",
                },
            });
            if (existingManager) {
                return { ok: false, message: "Department already has a manager" };
            }
        }
    }

    if (positionId) {
        const position = await prisma.position.findFirst({
            where: { id: positionId, tenantId, deletedAt: null },
        });
        if (!position) {
            return { ok: false, message: "Position not found or does not belong to this tenant" };
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

    if (baseSalary != null && baseSalary !== "") {
        const salary = Number(baseSalary);
        if (Number.isNaN(salary) || salary < 0) {
            return { ok: false, message: "Base salary must be a non-negative number" };
        }
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
        where: {
            tenantId,
            isDeleted: false,
            email: { equals: normalizedEmail, mode: "insensitive" },
        },
    });
    if (existingUser) {
        return { ok: false, message: "User with this email already exists in this tenant" };
    }

    const pendingInvite = await prisma.invitation.findFirst({
        where: {
            tenantId,
            status: "PENDING",
            expiresAt: { gte: new Date() },
            email: { equals: normalizedEmail, mode: "insensitive" },
        },
    });
    if (pendingInvite) {
        return { ok: false, message: "A pending invitation already exists for this email" };
    }

    return { ok: true };
}

/**
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.senderId
 * @param {string} params.senderRole
 * @param {object} params.body
 * @returns {Promise<{ ok: true, invitation: object } | { ok: false, statusCode: number, message: string }>}
 */
export async function createInvitationInternal({ tenantId, senderId, senderRole, body }) {
    const {
        email,
        role,
        departmentId,
        positionId,
        dateOfBirth,
        hireDate,
        employmentStatus,
        employmentType,
        baseSalary,
        salaryPeriodType,
        salaryEffectiveDate,
        salaryCurrency,
    } = body || {};

    const pre = await validateInvitationPayload({ tenantId, senderRole, body });
    if (!pre.ok) {
        const code =
            pre.message.includes("already exists") || pre.message.includes("pending invitation")
                ? 409
                : pre.message.includes("Only HR_ADMIN")
                  ? 403
                  : 400;
        return { ok: false, statusCode: code, message: pre.message };
    }

    const validPeriodTypes = ["MONTHLY", "ANNUAL"];
    const salaryPeriodTypeVal =
        salaryPeriodType != null && validPeriodTypes.includes(String(salaryPeriodType).toUpperCase())
            ? String(salaryPeriodType).toUpperCase()
            : "MONTHLY";

    const token = crypto.randomBytes(32).toString("base64url");
    const expiryDate = new Date(Date.now() + 1000 * 60 * 60 * 48);

    const dateOfBirthParsed = dateOfBirth ? parseFlexibleDate(dateOfBirth) : null;
    const hireDateParsed = hireDate ? parseFlexibleDate(hireDate) : null;
    const salaryEffectiveDateParsed = salaryEffectiveDate ? parseFlexibleDate(salaryEffectiveDate) : null;
    const baseSalaryNum =
        baseSalary != null && baseSalary !== "" ? Number(baseSalary) : null;
    const salaryCurrencyVal =
        salaryCurrency != null && String(salaryCurrency).trim() !== ""
            ? String(salaryCurrency).trim()
            : "GMD";

    const normalizedEmail = normalizeAuthEmail(email);
    if (!normalizedEmail) {
        return { ok: false, statusCode: 400, message: "Invalid email format" };
    }

    const newInvitation = await prisma.invitation.create({
        data: {
            senderId,
            tenantId,
            email: normalizedEmail,
            role,
            departmentId: departmentId || null,
            positionId: positionId || null,
            token,
            expiresAt: expiryDate,
            dateOfBirth: dateOfBirthParsed,
            hireDate: hireDateParsed,
            employmentStatus:
                employmentStatus != null && employmentStatus !== "" ? employmentStatus : null,
            employmentType:
                employmentType != null && employmentType !== "" ? employmentType : null,
            baseSalary: baseSalaryNum,
            salaryPeriodType: salaryPeriodTypeVal,
            salaryEffectiveDate: salaryEffectiveDateParsed,
            salaryCurrency: salaryCurrencyVal,
        },
        include: {
            tenant: { select: { name: true } },
            department: { select: { id: true, name: true } },
            position: { select: { id: true, title: true } },
        },
    });

    const clientUrl =
        process.env.NODE_ENV === "development" ? "http://localhost:3000" : process.env.CLIENT_URL;
    const acceptLink = `${clientUrl}/accept-invite/${newInvitation.token}`;
    const tenantName = newInvitation.tenant?.name || "your organization";
    try {
        await sendInvitationEmail({
            to: newInvitation.email,
            acceptLink,
            tenantName,
            expiresAt: newInvitation.expiresAt,
        });
    } catch (emailError) {
        logger.error(
            `Invitation created but failed to send email to ${newInvitation.email}: ${emailError.message}`,
            { stack: emailError.stack }
        );
    }

    return { ok: true, invitation: newInvitation };
}

/**
 * Send setup invitation for an existing employee (no credentials yet).
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.senderId
 * @param {string} params.senderRole
 * @param {string} params.employeeId
 * @returns {Promise<{ ok: true, invitation: object } | { ok: false, statusCode: number, message: string }>}
 */
export async function createSetupInvitationInternal({ tenantId, senderId, senderRole, employeeId }) {
    if (!employeeId) {
        return { ok: false, statusCode: 400, message: "Employee ID is required" };
    }

    const canSend =
        senderRole === "HR_ADMIN" ||
        senderRole === "HR_STAFF" ||
        senderRole === "SUPER_ADMIN";
    if (!canSend) {
        return { ok: false, statusCode: 403, message: "Only HR users can send invitations" };
    }

    const employee = await prisma.user.findFirst({
        where: {
            id: employeeId,
            tenantId,
            isDeleted: false,
        },
        select: {
            id: true,
            email: true,
            password: true,
            role: true,
            departmentId: true,
            positionId: true,
            dateOfBirth: true,
            hireDate: true,
            status: true,
            employmentType: true,
            accounts: credentialAccountsInclude,
        },
    });

    if (!employee) {
        return { ok: false, statusCode: 404, message: "Employee not found" };
    }

    if ((employee.status || "") === "INACTIVE") {
        return { ok: false, statusCode: 409, message: "Cannot send invitation to inactive employee" };
    }

    if (!employee.email) {
        return { ok: false, statusCode: 400, message: "Employee does not have an email address" };
    }

    if (hasStoredLoginCredentials(employee.password, employee.accounts)) {
        return { ok: false, statusCode: 409, message: "Employee already has login credentials" };
    }

    const inviteEmail = normalizeAuthEmail(employee.email);
    if (!inviteEmail) {
        return { ok: false, statusCode: 400, message: "Employee does not have a valid email address" };
    }

    const pendingInvite = await prisma.invitation.findFirst({
        where: {
            tenantId,
            status: "PENDING",
            expiresAt: {
                gte: new Date(),
            },
            email: { equals: inviteEmail, mode: "insensitive" },
        },
    });
    if (pendingInvite) {
        return { ok: false, statusCode: 409, message: "A pending invitation already exists for this employee" };
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiryDate = new Date(Date.now() + 1000 * 60 * 60 * 48);

    const newInvitation = await prisma.invitation.create({
        data: {
            senderId,
            tenantId,
            email: inviteEmail,
            role: employee.role ?? "STAFF",
            departmentId: employee.departmentId || null,
            positionId: employee.positionId || null,
            token,
            expiresAt: expiryDate,
            dateOfBirth: employee.dateOfBirth ?? null,
            hireDate: employee.hireDate ?? null,
            employmentStatus: employee.status ?? null,
            employmentType: employee.employmentType ?? null,
        },
        include: {
            tenant: {
                select: {
                    name: true,
                },
            },
        },
    });

    const clientUrl =
        process.env.NODE_ENV === "development" ? "http://localhost:3000" : process.env.CLIENT_URL;
    const acceptLink = `${clientUrl}/accept-invite/${newInvitation.token}`;
    const tenantName = newInvitation.tenant?.name || "your organization";
    try {
        await sendInvitationEmail({
            to: newInvitation.email,
            acceptLink,
            tenantName,
            expiresAt: newInvitation.expiresAt,
        });
    } catch (emailError) {
        logger.error(
            `Setup invitation created but failed to send invitation email to ${newInvitation.email}: ${emailError.message}`,
            { stack: emailError.stack }
        );
    }

    return { ok: true, invitation: newInvitation };
}
