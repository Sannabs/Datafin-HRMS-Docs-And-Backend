import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { createEmployeeInternal } from "./employee-create-internal.service.js";
import {
    createInvitationInternal,
    createSetupInvitationInternal,
} from "./invitation-internal.service.js";
import { getOrCreateDepartment, getOrCreatePosition } from "./batch-org.service.js";
import {
    findLatestSalaryStructureForUser,
    upsertAllowanceLineOnStructure,
    upsertDeductionLineOnStructure,
} from "./batch-salary-line.service.js";
import { parseFlexibleDate } from "../utils/date-parser.js";
import { recalculateSalary } from "../calculations/salary-calculations.js";

function pick(row, ...keys) {
    for (const k of keys) {
        const v = row[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

function upperEnum(s, fallback) {
    const t = pick({ v: s }, "v");
    if (!t) return fallback;
    return String(t).toUpperCase().replace(/\s+/g, "_");
}

async function syncJobCounts(batchJobId) {
    const [s, f, t] = await Promise.all([
        prisma.batchJobRow.count({ where: { batchJobId, status: "SUCCESS" } }),
        prisma.batchJobRow.count({ where: { batchJobId, status: "FAILED" } }),
        prisma.batchJobRow.count({ where: { batchJobId } }),
    ]);
    await prisma.batchJob.update({
        where: { id: batchJobId },
        data: {
            successCount: s,
            failedCount: f,
            processedCount: s + f,
            totalRows: t,
        },
    });
}

/**
 * @param {string} batchJobId
 */
export async function processBatchJobById(batchJobId) {
    const job = await prisma.batchJob.findUnique({
        where: { id: batchJobId },
    });

    if (!job) {
        logger.warn(`processBatchJobById: job ${batchJobId} not found`);
        return;
    }

    if (job.status === "COMPLETED") return;

    try {
        const actorRole = job.inputJson?.actorRole || "HR_ADMIN";
        const senderId = job.createdByUserId;

        const deptCache = new Map();
        const posCache = new Map();

        const rows = await prisma.batchJobRow.findMany({
            where: { batchJobId, status: "PENDING" },
            orderBy: { rowNumber: "asc" },
        });

        if (rows.length === 0) {
            await syncJobCounts(batchJobId);
            await prisma.batchJob.update({
                where: { id: batchJobId },
                data: {
                    status: "COMPLETED",
                    processCompletedAt: new Date(),
                },
            });
            return;
        }

        for (const row of rows) {
            const payload = row.rawPayload && typeof row.rawPayload === "object" ? row.rawPayload : {};
            let errMsg = null;
            let errField = null;
            let resultEntityId = null;

            try {
                switch (job.type) {
                    case "EMPLOYEE_CREATION": {
                        const name = pick(payload, "name");
                        const email = pick(payload, "email");
                        const departmentName = pick(payload, "department", "department_name", "departmentName");
                        const positionTitle = pick(payload, "position", "position_title", "positionTitle");
                        let departmentId = null;
                        let positionId = null;
                        if (departmentName) {
                            departmentId = await getOrCreateDepartment(job.tenantId, departmentName, deptCache);
                        }
                        if (positionTitle) {
                            positionId = await getOrCreatePosition(job.tenantId, positionTitle, posCache);
                        }
                        const body = {
                            name,
                            email,
                            role: upperEnum(pick(payload, "role"), "STAFF"),
                            departmentId,
                            positionId,
                            dateOfBirth: pick(payload, "date_of_birth", "dateOfBirth") || undefined,
                            employmentStatus: pick(payload, "employment_status", "employmentStatus") || undefined,
                            employmentType: pick(payload, "employment_type", "employmentType") || undefined,
                            hireDate: pick(payload, "hire_date", "hireDate") || undefined,
                            baseSalary: pick(payload, "base_salary", "baseSalary") || undefined,
                            salaryPeriodType: pick(payload, "salary_period_type", "salaryPeriodType") || undefined,
                            salaryEffectiveDate:
                                pick(payload, "salary_effective_date", "salaryEffectiveDate") || undefined,
                            salaryCurrency: pick(payload, "salary_currency", "salaryCurrency") || undefined,
                        };
                        const r = await createEmployeeInternal({
                            tenantId: job.tenantId,
                            actorRole,
                            body,
                        });
                        if (!r.ok) {
                            errMsg = r.message;
                            errField = "row";
                        } else {
                            resultEntityId = r.user.id;
                        }
                        break;
                    }
                    case "EMPLOYEE_INVITATION": {
                        const employeeId = pick(payload, "employeeId", "employee_id", "employeeid");
                        if (employeeId) {
                            const r = await createSetupInvitationInternal({
                                tenantId: job.tenantId,
                                senderId,
                                senderRole: actorRole,
                                employeeId,
                            });
                            if (!r.ok) {
                                errMsg = r.message;
                                errField = "row";
                            } else {
                                resultEntityId = r.invitation.id;
                            }
                            break;
                        }

                        const email = pick(payload, "email");
                        const departmentName = pick(payload, "department", "department_name", "departmentName");
                        const positionTitle = pick(payload, "position", "position_title", "positionTitle");
                        let departmentId = null;
                        let positionId = null;
                        if (departmentName) {
                            departmentId = await getOrCreateDepartment(job.tenantId, departmentName, deptCache);
                        }
                        if (positionTitle) {
                            positionId = await getOrCreatePosition(job.tenantId, positionTitle, posCache);
                        }
                        const body = {
                            email,
                            role: upperEnum(pick(payload, "role"), "STAFF"),
                            departmentId,
                            positionId,
                            dateOfBirth: pick(payload, "date_of_birth", "dateOfBirth") || undefined,
                            hireDate: pick(payload, "hire_date", "hireDate") || undefined,
                            employmentStatus: pick(payload, "employment_status", "employmentStatus") || undefined,
                            employmentType: pick(payload, "employment_type", "employmentType") || undefined,
                            baseSalary: pick(payload, "base_salary", "baseSalary") || undefined,
                            salaryPeriodType: pick(payload, "salary_period_type", "salaryPeriodType") || undefined,
                            salaryEffectiveDate:
                                pick(payload, "salary_effective_date", "salaryEffectiveDate") || undefined,
                            salaryCurrency: pick(payload, "salary_currency", "salaryCurrency") || undefined,
                        };
                        const r = await createInvitationInternal({
                            tenantId: job.tenantId,
                            senderId,
                            senderRole: actorRole,
                            body,
                        });
                        if (!r.ok) {
                            errMsg = r.message;
                            errField = "row";
                        } else {
                            resultEntityId = r.invitation.id;
                        }
                        break;
                    }
                    case "ALLOWANCE_ALLOCATION": {
                        const userId = pick(payload, "user_id", "userid", "userId");
                        const allowanceTypeId = pick(
                            payload,
                            "allowance_type_id",
                            "allowancetypeid",
                            "allowanceTypeId"
                        );
                        if (!userId || !allowanceTypeId) {
                            errMsg = "user_id and allowance_type_id are required";
                            break;
                        }
                        const structure = await findLatestSalaryStructureForUser(job.tenantId, userId);
                        if (!structure) {
                            errMsg = "No salary structure for employee";
                            break;
                        }
                        const methodRaw = pick(payload, "calculation_method", "calculationMethod");
                        const method = methodRaw ? upperEnum(methodRaw, "FIXED") : "FIXED";
                        const line = {
                            allowanceTypeId,
                            amount: Number(payload.amount ?? 0),
                            calculationMethod: method,
                            amountPeriodType:
                                pick(payload, "amount_period_type", "amountPeriodType") || "MONTHLY",
                            formulaExpression:
                                pick(payload, "formula_expression", "formulaExpression") || null,
                            calculationRuleId:
                                pick(payload, "calculation_rule_id", "calculationRuleId") || null,
                        };
                        const ur = await upsertAllowanceLineOnStructure(job.tenantId, structure.id, line);
                        if (!ur.ok) {
                            errMsg = ur.message;
                        } else {
                            resultEntityId = structure.id;
                        }
                        break;
                    }
                    case "DEDUCTION_ALLOCATION": {
                        const userId = pick(payload, "user_id", "userid", "userId");
                        const deductionTypeId = pick(
                            payload,
                            "deduction_type_id",
                            "deductiontypeid",
                            "deductionTypeId"
                        );
                        if (!userId || !deductionTypeId) {
                            errMsg = "user_id and deduction_type_id are required";
                            break;
                        }
                        const structure = await findLatestSalaryStructureForUser(job.tenantId, userId);
                        if (!structure) {
                            errMsg = "No salary structure for employee";
                            break;
                        }
                        const methodRaw = pick(payload, "calculation_method", "calculationMethod");
                        const method = methodRaw ? upperEnum(methodRaw, "FIXED") : "FIXED";
                        const line = {
                            deductionTypeId,
                            amount: Number(payload.amount ?? 0),
                            calculationMethod: method,
                            amountPeriodType:
                                pick(payload, "amount_period_type", "amountPeriodType") || "MONTHLY",
                            formulaExpression:
                                pick(payload, "formula_expression", "formulaExpression") || null,
                            calculationRuleId:
                                pick(payload, "calculation_rule_id", "calculationRuleId") || null,
                        };
                        const ur = await upsertDeductionLineOnStructure(job.tenantId, structure.id, line);
                        if (!ur.ok) {
                            errMsg = ur.message;
                        } else {
                            resultEntityId = structure.id;
                        }
                        break;
                    }
                    case "BULK_UPDATE": {
                        const employeeId = pick(payload, "employee_id", "employeeId", "employeeid");
                        const email = pick(payload, "email");
                        const field = pick(payload, "field", "field_name", "fieldName")
                            .toLowerCase()
                            .replace(/\s+/g, "_");
                        const value = pick(payload, "value", "new_value", "newValue");

                        let targetUser = null;
                        if (employeeId) {
                            targetUser = await prisma.user.findFirst({
                                where: { employeeId, tenantId: job.tenantId, isDeleted: false },
                            });
                        } else if (email) {
                            targetUser = await prisma.user.findFirst({
                                where: { email, tenantId: job.tenantId, isDeleted: false },
                            });
                        }
                        if (!targetUser) {
                            errMsg = "Employee not found (employee_id or email)";
                            break;
                        }

                        if (field === "base_salary" || field === "basesalary") {
                            const baseSalaryNum = Number(value);
                            if (Number.isNaN(baseSalaryNum) || baseSalaryNum <= 0) {
                                errMsg = "Invalid base_salary (must be a positive number)";
                                break;
                            }
                            const structure = await findLatestSalaryStructureForUser(
                                job.tenantId,
                                targetUser.id
                            );
                            const employeeContext = {
                                departmentId: targetUser.departmentId,
                                positionId: targetUser.positionId,
                                employmentType: targetUser.employmentType,
                                baseSalary: baseSalaryNum,
                                status: targetUser.status,
                                hireDate: targetUser.hireDate,
                            };
                            if (!structure) {
                                await prisma.salaryStructure.create({
                                    data: {
                                        tenantId: job.tenantId,
                                        userId: targetUser.id,
                                        baseSalary: baseSalaryNum,
                                        grossSalary: baseSalaryNum,
                                        salaryPeriodType: "MONTHLY",
                                        effectiveDate: new Date(),
                                        currency: "GMD",
                                    },
                                });
                                resultEntityId = targetUser.id;
                                break;
                            }
                            const { grossSalary } = await recalculateSalary(
                                baseSalaryNum,
                                structure.allowances,
                                structure.deductions,
                                employeeContext,
                                job.tenantId
                            );
                            await prisma.salaryStructure.update({
                                where: { id: structure.id },
                                data: { baseSalary: baseSalaryNum, grossSalary },
                            });
                            resultEntityId = targetUser.id;
                            break;
                        }

                        const data = {};
                        if (field === "phone") data.phone = value || null;
                        else if (field === "address") data.address = value || null;
                        else if (field === "name") data.name = value || null;
                        else if (field === "hire_date" || field === "hiredate") {
                            const hd = parseFlexibleDate(value);
                            if (!hd) {
                                errMsg = "Invalid hire_date";
                                break;
                            }
                            data.hireDate = hd;
                        } else if (field === "date_of_birth" || field === "dateofbirth") {
                            const dob = parseFlexibleDate(value);
                            if (!dob) {
                                errMsg = "Invalid date_of_birth";
                                break;
                            }
                            data.dateOfBirth = dob;
                        }
                        else if (field === "employment_type") {
                            const et = upperEnum(value, "");
                            const allowed = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];
                            if (!allowed.includes(et)) {
                                errMsg = "Invalid employment_type";
                                break;
                            }
                            data.employmentType = et;
                        } else if (field === "employment_status" || field === "status") {
                            const st = upperEnum(value, "");
                            const allowed = ["INACTIVE", "ACTIVE", "ON_LEAVE"];
                            if (!allowed.includes(st)) {
                                errMsg = "Invalid employment_status";
                                break;
                            }
                            data.status = st;
                        } else if (field === "department") {
                            const did = await getOrCreateDepartment(job.tenantId, value, deptCache);
                            data.departmentId = did;
                        } else if (field === "position") {
                            const pid = await getOrCreatePosition(job.tenantId, value, posCache);
                            data.positionId = pid;
                        } else {
                            errMsg = `Unsupported field: ${field}`;
                            break;
                        }

                        await prisma.user.update({
                            where: { id: targetUser.id },
                            data,
                        });
                        resultEntityId = targetUser.id;
                        break;
                    }
                    default:
                        errMsg = `Unknown batch type: ${job.type}`;
                }
            } catch (e) {
                errMsg = e.message || "Unexpected error";
                logger.error(`Batch row ${row.id} error: ${errMsg}`, { stack: e.stack });
            }

            if (errMsg) {
                await prisma.batchJobRow.update({
                    where: { id: row.id },
                    data: {
                        status: "FAILED",
                        errorMessage: errMsg,
                        errorField: errField,
                    },
                });
            } else {
                await prisma.batchJobRow.update({
                    where: { id: row.id },
                    data: {
                        status: "SUCCESS",
                        resultEntityId,
                        errorMessage: null,
                        errorField: null,
                    },
                });
            }

            await syncJobCounts(batchJobId);
        }

        await prisma.batchJob.update({
            where: { id: batchJobId },
            data: {
                status: "COMPLETED",
                processCompletedAt: new Date(),
            },
        });

        logger.info(`Batch job ${batchJobId} completed`);
    } catch (e) {
        logger.error(`Batch job ${batchJobId} fatal: ${e.message}`, { stack: e.stack });
        await prisma.batchJob.update({
            where: { id: batchJobId },
            data: {
                status: "FAILED",
                failureReason: (e.message || "Processing failed").slice(0, 500),
                processCompletedAt: new Date(),
            },
        });
        throw e;
    }
}
