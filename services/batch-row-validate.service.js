import prisma from "../config/prisma.config.js";
import { findDepartmentIdByName, findPositionIdByTitle, orgMapKey } from "./batch-org.service.js";
import { parseFlexibleDate } from "../utils/date-parser.js";
import { VALID_EMPLOYMENT_STATUSES } from "../utils/employee-status.util.js";

function pick(payload, ...keys) {
    for (const k of keys) {
        const v = payload[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

function upperEnum(s, fallback) {
    const t = pick({ v: s }, "v");
    if (!t) return fallback;
    return String(t).toUpperCase().replace(/\s+/g, "_");
}

function normalizeErrorMessage(msg) {
    return String(msg || "").trim();
}

function fieldValue(payload, ...keys) {
    for (const k of keys) {
        const v = payload?.[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

function mapEmployeeCreationError(message, payload) {
    const m = normalizeErrorMessage(message);

    if (m === "Name is required") {
        return { field: "name", value: fieldValue(payload, "name") };
    }
    if (m === "Email is required" || m === "Invalid email format") {
        return { field: "email", value: fieldValue(payload, "email", "Email") };
    }
    if (m.includes("User with this email already exists")) {
        return { field: "email", value: fieldValue(payload, "email", "Email") };
    }
    if (m === "Base salary is required" || m.includes("Base salary must be")) {
        return { field: "base_salary", value: fieldValue(payload, "base_salary", "baseSalary") };
    }
    if (m.startsWith("Invalid role")) {
        return { field: "role", value: fieldValue(payload, "role") };
    }
    if (m.startsWith("Department not found")) {
        return { field: "department", value: fieldValue(payload, "department", "department_name", "departmentName") };
    }
    if (m.startsWith("Position not found")) {
        return { field: "position", value: fieldValue(payload, "position", "position_title", "positionTitle") };
    }
    if (m.startsWith("Invalid employment status")) {
        return { field: "employment_status", value: fieldValue(payload, "employment_status", "employmentStatus") };
    }
    if (m.startsWith("Invalid employment type")) {
        return { field: "employment_type", value: fieldValue(payload, "employment_type", "employmentType") };
    }
    if (m.includes("salary period type")) {
        return { field: "salary_period_type", value: fieldValue(payload, "salary_period_type", "salaryPeriodType") };
    }
    if (m === "Invalid date of birth") {
        return { field: "date_of_birth", value: fieldValue(payload, "date_of_birth", "dateOfBirth") };
    }
    if (m.includes("Only HR users")) {
        return { field: "authorization", value: "" };
    }
    if (m === "Tenant not found") {
        return { field: "tenant", value: "" };
    }

    return { field: "row", value: "" };
}

function mapInvitationError(message, payload) {
    const m = normalizeErrorMessage(message);

    if (m === "Email is required" || m === "Invalid email format") {
        return { field: "email", value: fieldValue(payload, "email", "Email") };
    }
    if (m === "Role is required" || m.startsWith("Invalid role")) {
        return { field: "role", value: fieldValue(payload, "role") };
    }
    if (m.includes("Only HR_ADMIN")) {
        return { field: "authorization", value: "" };
    }
    if (m.startsWith("Department not found") || m === "Department already has a manager") {
        return { field: "department", value: fieldValue(payload, "department", "department_name", "departmentName") };
    }
    if (m.startsWith("Position not found")) {
        return { field: "position", value: fieldValue(payload, "position", "position_title", "positionTitle") };
    }
    if (m.startsWith("Invalid employment status")) {
        return { field: "employment_status", value: fieldValue(payload, "employment_status", "employmentStatus") };
    }
    if (m.startsWith("Invalid employment type")) {
        return { field: "employment_type", value: fieldValue(payload, "employment_type", "employmentType") };
    }
    if (m.includes("Base salary must be")) {
        return { field: "base_salary", value: fieldValue(payload, "base_salary", "baseSalary") };
    }
    if (m.includes("salary period type")) {
        return { field: "salary_period_type", value: fieldValue(payload, "salary_period_type", "salaryPeriodType") };
    }
    if (m === "Invalid date of birth") {
        return { field: "date_of_birth", value: fieldValue(payload, "date_of_birth", "dateOfBirth") };
    }
    if (m.includes("already exists") || m.includes("pending invitation")) {
        return { field: "email", value: fieldValue(payload, "email", "Email") };
    }

    return { field: "row", value: "" };
}

function buildValidationMeta(field, message) {
    const m = normalizeErrorMessage(message).toLowerCase();
    const f = String(field || "").toLowerCase();

    if (m.includes("required")) {
        return {
            code: "REQUIRED_FIELD_MISSING",
            hint: "Provide a value for this required column in the CSV row.",
        };
    }
    if (m.includes("invalid email")) {
        return {
            code: "INVALID_EMAIL_FORMAT",
            hint: "Use a valid email format like name@example.com.",
        };
    }
    if (m.includes("date of birth")) {
        return {
            code: "INVALID_DATE_OF_BIRTH",
            hint: "Use YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, or month-name formats like Sep 2, 2024.",
        };
    }
    if (m.includes("already exists")) {
        return {
            code: "DUPLICATE_RESOURCE",
            hint: "Use a different unique value or remove duplicate rows.",
        };
    }
    if (m.includes("pending invitation")) {
        return {
            code: "PENDING_INVITATION_EXISTS",
            hint: "Wait for the pending invite to expire or cancel it before inviting again.",
        };
    }
    if (m.includes("not found")) {
        return {
            code: "REFERENCE_NOT_FOUND",
            hint: "Verify the referenced employee, department, or position exists.",
        };
    }
    if (m.includes("unsupported field")) {
        return {
            code: "UNSUPPORTED_FIELD",
            hint: "Use only supported field names from the bulk update template.",
        };
    }
    if (m.includes("employment type")) {
        return {
            code: "INVALID_EMPLOYMENT_TYPE",
            hint: "Use one of: FULL_TIME, PART_TIME, CONTRACT, INTERN.",
        };
    }
    if (m.includes("employment status")) {
        return {
            code: "INVALID_EMPLOYMENT_STATUS",
            hint: "Use one of: ACTIVE, INACTIVE, ON_LEAVE, PROBATION.",
        };
    }
    if (m.includes("salary period type")) {
        return {
            code: "INVALID_SALARY_PERIOD_TYPE",
            hint: "Use MONTHLY or ANNUAL.",
        };
    }
    if (m.includes("base salary")) {
        return {
            code: "INVALID_BASE_SALARY",
            hint: "Enter a numeric salary value greater than zero.",
        };
    }
    if (f === "authorization") {
        return {
            code: "UNAUTHORIZED_OPERATION",
            hint: "Run this batch with a role that has permission for this operation.",
        };
    }

    return {
        code: "VALIDATION_ERROR",
        hint: "Review this row and correct the highlighted field value.",
    };
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
const VALID_ROLES = ["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"];
const VALID_SALARY_PERIOD_TYPES = ["MONTHLY", "ANNUAL"];

function pushValidationError(rowErrors, rn, field, message, value = "") {
    const meta = buildValidationMeta(field, message);
    rowErrors.push({
        row_number: rn,
        field,
        message: normalizeErrorMessage(message),
        value: String(value || ""),
        code: meta.code,
        hint: meta.hint,
    });
}

async function resolveDeptPosIds(tenantId, departmentName, positionTitle, cache) {
    let departmentId = null;
    let positionId = null;
    if (departmentName) {
        const key = orgMapKey(departmentName);
        if (!cache.dept.has(key)) {
            cache.dept.set(key, await findDepartmentIdByName(tenantId, departmentName));
        }
        departmentId = cache.dept.get(key);
    }
    if (positionTitle) {
        const key = orgMapKey(positionTitle);
        if (!cache.pos.has(key)) {
            cache.pos.set(key, await findPositionIdByTitle(tenantId, positionTitle));
        }
        positionId = cache.pos.get(key);
    }
    return { departmentId, positionId };
}

/**
 * DB-backed row validation aligned with create/internal rules (read-only; no org auto-create).
 * Department/position are resolved by name only; names not yet in DB stay null. At process time
 * the worker may get-or-create org rows first, so a row can pass preview but still succeed in process
 * (or fail for a different reason after org is created).
 *
 * @param {object} params
 * @param {string} params.tenantId
 * @param {string} params.actorRole
 * @param {"EMPLOYEE_CREATION"|"EMPLOYEE_INVITATION"|"BULK_UPDATE"} params.batchType
 * @param {Record<string, string>[]} params.rows
 */
export async function deepValidateCsvRowsForBatch({ tenantId, actorRole, batchType, rows }) {
    const errors = [];
    let valid = 0;
    const cache = { dept: new Map(), pos: new Map() };
    let tenantExists = null;

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rn = i + 2;
        const payload = row && typeof row === "object" ? row : {};
        const rowErrors = [];

        try {
            if (batchType === "EMPLOYEE_CREATION") {
                const canCreate = actorRole === "HR_ADMIN" || actorRole === "HR_STAFF" || actorRole === "SUPER_ADMIN";
                if (!canCreate) {
                    pushValidationError(rowErrors, rn, "authorization", "Only HR users can create employees");
                }

                const name = pick(payload, "name");
                const email = pick(payload, "email", "Email");
                const roleRaw = pick(payload, "role");
                const role = upperEnum(roleRaw, "STAFF");
                const employmentStatus = pick(payload, "employment_status", "employmentStatus");
                const employmentType = pick(payload, "employment_type", "employmentType");
                const salaryPeriodType = pick(payload, "salary_period_type", "salaryPeriodType");
                const baseSalary = pick(payload, "base_salary", "baseSalary");
                const dateOfBirth = pick(payload, "date_of_birth", "dateOfBirth");
                const departmentName = pick(payload, "department", "department_name", "departmentName");
                const positionTitle = pick(payload, "position", "position_title", "positionTitle");

                if (!name) {
                    pushValidationError(rowErrors, rn, "name", "Name is required");
                }
                if (!email) {
                    pushValidationError(rowErrors, rn, "email", "Email is required");
                } else if (!emailRegex.test(email)) {
                    pushValidationError(rowErrors, rn, "email", "Invalid email format", email);
                }
                if (roleRaw && !VALID_ROLES.includes(role)) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "role",
                        "Invalid role. Must be one of: HR_ADMIN, HR_STAFF, STAFF, DEPARTMENT_ADMIN",
                        roleRaw
                    );
                }
                if (!baseSalary) {
                    pushValidationError(rowErrors, rn, "base_salary", "Base salary is required");
                } else {
                    const baseSalaryNum = Number(baseSalary);
                    if (Number.isNaN(baseSalaryNum) || baseSalaryNum <= 0) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "base_salary",
                            "Base salary must be a positive number",
                            baseSalary
                        );
                    }
                }
                if (employmentStatus && !VALID_EMPLOYMENT_STATUSES.includes(employmentStatus)) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "employment_status",
                        `Invalid employment status. Must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}`,
                        employmentStatus
                    );
                }
                if (employmentType && !VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "employment_type",
                        `Invalid employment type. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}`,
                        employmentType
                    );
                }
                if (salaryPeriodType && !VALID_SALARY_PERIOD_TYPES.includes(upperEnum(salaryPeriodType, ""))) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "salary_period_type",
                        "salary period type must be MONTHLY or ANNUAL",
                        salaryPeriodType
                    );
                }
                if (dateOfBirth) {
                    const dob = parseFlexibleDate(dateOfBirth);
                    if (!dob) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "date_of_birth",
                            "Invalid date of birth",
                            dateOfBirth
                        );
                    }
                }

                const bankNameRaw = pick(payload, "bank_name", "bankName");
                const accountNumberRaw = pick(payload, "account_number", "accountNumber");
                if (bankNameRaw && String(bankNameRaw).trim().length > 120) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "bank_name",
                        "bank_name must be at most 120 characters",
                        bankNameRaw
                    );
                }
                if (accountNumberRaw && String(accountNumberRaw).trim().length > 64) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "account_number",
                        "account_number must be at most 64 characters",
                        accountNumberRaw
                    );
                }

                await resolveDeptPosIds(
                    tenantId,
                    departmentName,
                    positionTitle,
                    cache
                );

                if (email) {
                    const existingUser = await prisma.user.findFirst({
                        where: { email, tenantId, isDeleted: false },
                    });
                    if (existingUser) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "email",
                            "User with this email already exists in this tenant",
                            email
                        );
                    }
                }

                if (tenantExists == null) {
                    const tenant = await prisma.tenant.findUnique({
                        where: { id: tenantId },
                        select: { id: true },
                    });
                    tenantExists = !!tenant;
                }
                if (!tenantExists) {
                    pushValidationError(rowErrors, rn, "tenant", "Tenant not found");
                }
            } else if (batchType === "EMPLOYEE_INVITATION") {
                const email = pick(payload, "email", "Email");
                const roleRaw = pick(payload, "role");
                const role = upperEnum(roleRaw, "");
                const employmentStatus = pick(payload, "employment_status", "employmentStatus");
                const employmentType = pick(payload, "employment_type", "employmentType");
                const salaryPeriodType = pick(payload, "salary_period_type", "salaryPeriodType");
                const baseSalary = pick(payload, "base_salary", "baseSalary");
                const dateOfBirth = pick(payload, "date_of_birth", "dateOfBirth");
                const departmentName = pick(payload, "department", "department_name", "departmentName");
                const positionTitle = pick(payload, "position", "position_title", "positionTitle");
                const { departmentId, positionId } = await resolveDeptPosIds(
                    tenantId,
                    departmentName,
                    positionTitle,
                    cache
                );

                if (!email) {
                    pushValidationError(rowErrors, rn, "email", "Email is required");
                } else if (!emailRegex.test(email)) {
                    pushValidationError(rowErrors, rn, "email", "Invalid email format", email);
                }

                if (!roleRaw) {
                    pushValidationError(rowErrors, rn, "role", "Role is required");
                } else if (!VALID_ROLES.includes(role)) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "role",
                        "Invalid role. Must be one of: HR_ADMIN, HR_STAFF, STAFF, DEPARTMENT_ADMIN",
                        roleRaw
                    );
                }

                const canSend = actorRole === "HR_ADMIN" || actorRole === "SUPER_ADMIN";
                if (!canSend) {
                    pushValidationError(rowErrors, rn, "authorization", "Only HR_ADMIN can send invitations");
                }

                if (departmentId && role === "DEPARTMENT_ADMIN") {
                    const department = await prisma.department.findFirst({
                        where: { id: departmentId, tenantId, deletedAt: null },
                        select: { managerId: true },
                    });
                    if (department?.managerId) {
                        const existingManager = await prisma.user.findFirst({
                            where: {
                                id: department.managerId,
                                tenantId,
                                isDeleted: false,
                                status: "ACTIVE",
                            },
                            select: { id: true },
                        });
                        if (existingManager) {
                            pushValidationError(
                                rowErrors,
                                rn,
                                "department",
                                "Department already has a manager",
                                departmentName
                            );
                        }
                    }
                }

                if (employmentStatus && !VALID_EMPLOYMENT_STATUSES.includes(employmentStatus)) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "employment_status",
                        `Invalid employment status. Must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}`,
                        employmentStatus
                    );
                }
                if (employmentType && !VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "employment_type",
                        `Invalid employment type. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}`,
                        employmentType
                    );
                }
                if (baseSalary) {
                    const salary = Number(baseSalary);
                    if (Number.isNaN(salary) || salary < 0) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "base_salary",
                            "Base salary must be a non-negative number",
                            baseSalary
                        );
                    }
                }
                if (salaryPeriodType && !VALID_SALARY_PERIOD_TYPES.includes(upperEnum(salaryPeriodType, ""))) {
                    pushValidationError(
                        rowErrors,
                        rn,
                        "salary_period_type",
                        "salary period type must be MONTHLY or ANNUAL",
                        salaryPeriodType
                    );
                }
                if (dateOfBirth) {
                    const dob = parseFlexibleDate(dateOfBirth);
                    if (!dob) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "date_of_birth",
                            "Invalid date of birth",
                            dateOfBirth
                        );
                    }
                }

                if (email) {
                    const [existingUser, pendingInvite] = await Promise.all([
                        prisma.user.findFirst({
                            where: { email, tenantId, isDeleted: false },
                            select: { id: true },
                        }),
                        prisma.invitation.findFirst({
                            where: {
                                email,
                                tenantId,
                                expiresAt: { gte: new Date() },
                            },
                            select: { id: true },
                        }),
                    ]);
                    if (existingUser) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "email",
                            "User with this email already exists in this tenant",
                            email
                        );
                    }
                    if (pendingInvite) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "email",
                            "A pending invitation already exists for this email",
                            email
                        );
                    }
                }
            } else if (batchType === "BULK_UPDATE") {
                const employeeId = pick(payload, "employee_id", "employeeId", "employeeid");
                const email = pick(payload, "email");
                const fieldRaw = pick(payload, "field", "field_name", "fieldName");
                const field = fieldRaw.toLowerCase().replace(/\s+/g, "_");
                const value = pick(payload, "value", "new_value", "newValue");

                if (!fieldRaw) {
                    const message = "Field is required";
                    pushValidationError(rowErrors, rn, "field", message);
                }
                if (value === "") {
                    const message = "Value is required";
                    pushValidationError(rowErrors, rn, "value", message);
                }

                let targetUser = null;
                if (employeeId || email) {
                    if (employeeId) {
                        targetUser = await prisma.user.findFirst({
                            where: { employeeId, tenantId, isDeleted: false },
                            select: { id: true },
                        });
                    } else if (email) {
                        targetUser = await prisma.user.findFirst({
                            where: { email, tenantId, isDeleted: false },
                            select: { id: true },
                        });
                    }
                    if (!targetUser) {
                        const message = "Employee not found (employee_id or email)";
                        pushValidationError(rowErrors, rn, "employee_id", message, employeeId || email);
                    }
                } else {
                    const message = "Employee not found (employee_id or email)";
                    pushValidationError(rowErrors, rn, "employee_id", message, "");
                }

                if (field === "employment_type") {
                    const et = upperEnum(value, "");
                    const allowed = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
                    if (!allowed.includes(et)) {
                        const message = "Invalid employment_type";
                        pushValidationError(rowErrors, rn, "employment_type", message, value);
                    }
                } else if (field === "employment_status" || field === "status") {
                    const st = upperEnum(value, "");
                    if (!VALID_EMPLOYMENT_STATUSES.includes(st)) {
                        const message = "Invalid employment_status";
                        pushValidationError(rowErrors, rn, "employment_status", message, value);
                    }
                } else if (field === "hire_date" || field === "hiredate") {
                    const hd = parseFlexibleDate(value);
                    if (!hd) {
                        const message = "Invalid hire_date";
                        pushValidationError(rowErrors, rn, "hire_date", message, value);
                    }
                } else if (field === "date_of_birth" || field === "dateofbirth") {
                    const dob = parseFlexibleDate(value);
                    if (!dob) {
                        const message = "Invalid date_of_birth";
                        pushValidationError(rowErrors, rn, "date_of_birth", message, value);
                    }
                } else if (field === "name") {
                    if (!value) {
                        const message = "Name is required";
                        pushValidationError(rowErrors, rn, "name", message, value);
                    }
                } else if (field === "base_salary" || field === "basesalary") {
                    const salaryNum = Number(value);
                    if (Number.isNaN(salaryNum) || salaryNum <= 0) {
                        const message = "Invalid base_salary (must be a positive number)";
                        pushValidationError(rowErrors, rn, "base_salary", message, value);
                    }
                } else if (field === "ssn") {
                    if (value && String(value).trim().length > 64) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "field",
                            "ssn must be at most 64 characters",
                            value
                        );
                    }
                } else if (field === "bank_name" || field === "bankname") {
                    if (value && String(value).trim().length > 120) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "field",
                            "bank_name must be at most 120 characters",
                            value
                        );
                    }
                } else if (field === "account_number" || field === "accountnumber") {
                    if (value && String(value).trim().length > 64) {
                        pushValidationError(
                            rowErrors,
                            rn,
                            "field",
                            "account_number must be at most 64 characters",
                            value
                        );
                    }
                } else if (
                    fieldRaw &&
                    field !== "phone" &&
                    field !== "address" &&
                    field !== "department" &&
                    field !== "position"
                ) {
                    const message = `Unsupported field: ${field}`;
                    pushValidationError(rowErrors, rn, "field", message, fieldRaw);
                }
            }
        } catch (e) {
            const message = e.message || "Unexpected error processing row";
            pushValidationError(rowErrors, rn, "general", message);
        }

        if (rowErrors.length > 0) {
            errors.push(...rowErrors);
        } else {
            valid++;
        }
    }

    return {
        total_records: rows.length,
        valid_records: valid,
        invalid_records: rows.length - valid,
        errors,
    };
}
