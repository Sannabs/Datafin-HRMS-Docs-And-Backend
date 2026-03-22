import prisma from "../config/prisma.config.js";
import { findDepartmentIdByName, findPositionIdByTitle, orgMapKey } from "./batch-org.service.js";
import { validateEmployeeCreationPayload } from "./employee-create-internal.service.js";
import { validateInvitationPayload } from "./invitation-internal.service.js";

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

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rn = i + 2;
        const payload = row && typeof row === "object" ? row : {};

        try {
            if (batchType === "EMPLOYEE_CREATION") {
                const departmentName = pick(payload, "department", "department_name", "departmentName");
                const positionTitle = pick(payload, "position", "position_title", "positionTitle");
                const { departmentId, positionId } = await resolveDeptPosIds(
                    tenantId,
                    departmentName,
                    positionTitle,
                    cache
                );
                const body = {
                    name: pick(payload, "name"),
                    email: pick(payload, "email"),
                    role: upperEnum(pick(payload, "role"), "STAFF"),
                    departmentId,
                    positionId,
                    employmentStatus: pick(payload, "employment_status", "employmentStatus") || undefined,
                    employmentType: pick(payload, "employment_type", "employmentType") || undefined,
                    hireDate: pick(payload, "hire_date", "hireDate") || undefined,
                    baseSalary: pick(payload, "base_salary", "baseSalary") || undefined,
                    salaryPeriodType: pick(payload, "salary_period_type", "salaryPeriodType") || undefined,
                };
                const v = await validateEmployeeCreationPayload({ tenantId, actorRole, body });
                if (!v.ok) {
                    errors.push({ row_number: rn, field: "row", message: v.message, value: "" });
                } else {
                    valid++;
                }
            } else if (batchType === "EMPLOYEE_INVITATION") {
                const departmentName = pick(payload, "department", "department_name", "departmentName");
                const positionTitle = pick(payload, "position", "position_title", "positionTitle");
                const { departmentId, positionId } = await resolveDeptPosIds(
                    tenantId,
                    departmentName,
                    positionTitle,
                    cache
                );
                const body = {
                    email: pick(payload, "email"),
                    role: upperEnum(pick(payload, "role"), "STAFF"),
                    departmentId,
                    positionId,
                    hireDate: pick(payload, "hire_date", "hireDate") || undefined,
                    employmentStatus: pick(payload, "employment_status", "employmentStatus") || undefined,
                    employmentType: pick(payload, "employment_type", "employmentType") || undefined,
                    baseSalary: pick(payload, "base_salary", "baseSalary") || undefined,
                    salaryPeriodType: pick(payload, "salary_period_type", "salaryPeriodType") || undefined,
                };
                const v = await validateInvitationPayload({ tenantId, senderRole: actorRole, body });
                if (!v.ok) {
                    errors.push({ row_number: rn, field: "row", message: v.message, value: "" });
                } else {
                    valid++;
                }
            } else if (batchType === "BULK_UPDATE") {
                const employeeId = pick(payload, "employee_id", "employeeId", "employeeid");
                const email = pick(payload, "email");
                const fieldRaw = pick(payload, "field", "field_name", "fieldName");
                const field = fieldRaw.toLowerCase().replace(/\s+/g, "_");
                const value = pick(payload, "value", "new_value", "newValue");

                if (!fieldRaw) {
                    errors.push({ row_number: rn, field: "field", message: "Field is required", value: "" });
                    continue;
                }
                if (value === "") {
                    errors.push({ row_number: rn, field: "value", message: "Value is required", value: "" });
                    continue;
                }
                let targetUser = null;
                if (employeeId) {
                    targetUser = await prisma.user.findFirst({
                        where: { employeeId, tenantId, isDeleted: false },
                    });
                } else if (email) {
                    targetUser = await prisma.user.findFirst({
                        where: { email, tenantId, isDeleted: false },
                    });
                }
                if (!targetUser) {
                    errors.push({
                        row_number: rn,
                        field: "employee_id",
                        message: "Employee not found (employee_id or email)",
                        value: employeeId || email,
                    });
                    continue;
                }

                if (field === "employment_type") {
                    const et = upperEnum(value, "");
                    const allowed = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
                    if (!allowed.includes(et)) {
                        errors.push({
                            row_number: rn,
                            field: "employment_type",
                            message: "Invalid employment_type",
                            value,
                        });
                        continue;
                    }
                } else if (field === "employment_status" || field === "status") {
                    const st = upperEnum(value, "");
                    const allowed = ["INACTIVE", "ACTIVE", "TERMINATED", "RESIGNED", "ON_LEAVE"];
                    if (!allowed.includes(st)) {
                        errors.push({
                            row_number: rn,
                            field: "employment_status",
                            message: "Invalid employment_status",
                            value,
                        });
                        continue;
                    }
                } else if (
                    field !== "phone" &&
                    field !== "address" &&
                    field !== "department" &&
                    field !== "position"
                ) {
                    errors.push({
                        row_number: rn,
                        field: "field",
                        message: `Unsupported field: ${field}`,
                        value: fieldRaw,
                    });
                    continue;
                }
                valid++;
            }
        } catch (e) {
            errors.push({
                row_number: rn,
                field: "general",
                message: e.message || "Unexpected error processing row",
                value: "",
            });
        }
    }

    return {
        total_records: rows.length,
        valid_records: valid,
        invalid_records: rows.length - valid,
        errors,
    };
}
