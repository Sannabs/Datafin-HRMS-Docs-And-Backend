import archiver from "archiver";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { parseCsvBuffer } from "../utils/csv-parse-batch.utils.js";
import { generateBatchCode } from "../services/batch-code.service.js";
import { mapBatchJobToListItem, batchStatusToApi } from "../utils/batch-job.mapper.js";
import { createSSEConnection } from "../utils/sse.utils.js";
import { processBatchJobById } from "../services/batch-job-processor.service.js";
import { enqueueBatchJob, getBatchQueue } from "../queues/batch.queue.js";
import { deepValidateCsvRowsForBatch } from "../services/batch-row-validate.service.js";

const ENABLE_BULLMQ = process.env.ENABLE_BULLMQ_QUEUE === "true";

const MAX_BATCH_BULK_EXPORT = 200;

/** Cap rows loaded into memory when aggregating allowance/deduction batch rows by employee */
const MAX_ALLOCATION_ROWS_FOR_AGGREGATE = 10_000;

/**
 * For allowance/deduction allocation jobs, return one logical row per employee with
 * comma-separated type names (for UI). Search `q` is applied after aggregation.
 */
async function getAggregatedAllocationBatchRows({
    tenantId,
    jobId,
    jobType,
    status,
    q,
    page,
    limit,
}) {
    const where = {
        batchJobId: jobId,
        ...(status && ["PENDING", "SUCCESS", "FAILED", "SKIPPED"].includes(status) && { status }),
    };

    const allRows = await prisma.batchJobRow.findMany({
        where,
        orderBy: { rowNumber: "asc" },
        take: MAX_ALLOCATION_ROWS_FOR_AGGREGATE,
        select: {
            id: true,
            rowNumber: true,
            status: true,
            rawPayload: true,
            errorMessage: true,
        },
    });

    const allowanceIds = new Set();
    const deductionIds = new Set();
    const userIdCandidates = new Set();

    for (const r of allRows) {
        const payload = r.rawPayload && typeof r.rawPayload === "object" ? r.rawPayload : {};
        const uid = payload.userId ?? payload.userid ?? payload.user_id;
        if (uid) userIdCandidates.add(String(uid));
        if (jobType === "ALLOWANCE_ALLOCATION" && payload.allowanceTypeId) {
            allowanceIds.add(String(payload.allowanceTypeId));
        }
        if (jobType === "DEDUCTION_ALLOCATION" && payload.deductionTypeId) {
            deductionIds.add(String(payload.deductionTypeId));
        }
    }

    const [allowanceTypes, deductionTypes, users] = await Promise.all([
        allowanceIds.size > 0
            ? prisma.allowanceType.findMany({
                  where: { tenantId, id: { in: Array.from(allowanceIds) } },
                  select: { id: true, name: true },
              })
            : [],
        deductionIds.size > 0
            ? prisma.deductionType.findMany({
                  where: { tenantId, id: { in: Array.from(deductionIds) } },
                  select: { id: true, name: true },
              })
            : [],
        userIdCandidates.size > 0
            ? prisma.user.findMany({
                  where: {
                      id: { in: Array.from(userIdCandidates) },
                      tenantId,
                      isDeleted: false,
                  },
                  select: {
                      id: true,
                      name: true,
                      email: true,
                      image: true,
                      department: { select: { name: true } },
                  },
              })
            : [],
    ]);

    const allowanceNameById = new Map(allowanceTypes.map((t) => [t.id, t.name]));
    const deductionNameById = new Map(deductionTypes.map((t) => [t.id, t.name]));
    const userById = new Map(users.map((u) => [u.id, u]));

    const enrichedRows = allRows.map((r) => {
        const payload = r.rawPayload && typeof r.rawPayload === "object" ? { ...r.rawPayload } : {};
        const uid = payload.userId ?? payload.userid ?? payload.user_id;
        const lookupId = uid ? String(uid) : null;
        const u = lookupId ? userById.get(lookupId) : undefined;

        let typeDisplayName = "";
        if (jobType === "ALLOWANCE_ALLOCATION") {
            const tid = payload.allowanceTypeId ? String(payload.allowanceTypeId) : "";
            typeDisplayName =
                (tid && allowanceNameById.get(tid)) || payload.allowanceTypeName || payload.allowance_type_name || "";
        } else {
            const tid = payload.deductionTypeId ? String(payload.deductionTypeId) : "";
            typeDisplayName =
                (tid && deductionNameById.get(tid)) || payload.deductionTypeName || payload.deduction_type_name || "";
        }
        if (!typeDisplayName) typeDisplayName = "Unknown type";

        const merged = {
            ...payload,
            allocation_type_display_name: typeDisplayName,
        };
        if (u) {
            merged.name = payload.name ?? u.name ?? u.email;
            merged.email = payload.email ?? u.email;
            merged.department_name = payload.department_name ?? u.department?.name ?? "";
            merged.image = payload.image ?? u.image ?? null;
        }

        return { ...r, rawPayload: merged };
    });

    /** @type {Map<string, { minRow: number, rows: typeof enrichedRows, seenTypeKeys: Set<string>, orderedTypeNames: string[], failures: { typeName: string, message: string }[] }>} */
    const byUser = new Map();

    for (const r of enrichedRows) {
        const p = r.rawPayload || {};
        const uidRaw = p.userId ?? p.userid ?? p.user_id;
        const uid = uidRaw ? String(uidRaw) : "__unknown__";

        if (!byUser.has(uid)) {
            byUser.set(uid, {
                minRow: r.rowNumber,
                rows: [],
                seenTypeKeys: new Set(),
                orderedTypeNames: [],
                failures: [],
            });
        }
        const g = byUser.get(uid);
        g.minRow = Math.min(g.minRow, r.rowNumber);
        g.rows.push(r);

        const typeKey =
            jobType === "ALLOWANCE_ALLOCATION"
                ? `a:${String(p.allowanceTypeId || p.allocation_type_display_name)}`
                : `d:${String(p.deductionTypeId || p.allocation_type_display_name)}`;

        if (!g.seenTypeKeys.has(typeKey)) {
            g.seenTypeKeys.add(typeKey);
            g.orderedTypeNames.push(p.allocation_type_display_name || "Unknown type");
        }

        if (r.status === "FAILED" && r.errorMessage) {
            g.failures.push({
                typeName: p.allocation_type_display_name || "Unknown type",
                message: r.errorMessage,
            });
        }
    }

    let groups = Array.from(byUser.entries()).map(([uid, g]) => {
        const representative = g.rows.reduce((best, cur) =>
            cur.rowNumber < best.rowNumber ? cur : best
        );
        const p = representative.rawPayload || {};
        const typeNamesCsv = g.orderedTypeNames.join(", ");
        const failureSummary =
            g.failures.length > 0 ? g.failures.map((f) => `${f.typeName}: ${f.message}`).join("\n") : "";

        return {
            id: `agg:${jobId}:${uid}`,
            rowNumber: g.minRow,
            status: representative.status,
            rawPayload: {
                ...p,
                userId: uid === "__unknown__" ? undefined : uid,
                allocation_type_names_csv: typeNamesCsv,
                allocation_failure_details: failureSummary || undefined,
            },
            errorMessage: g.failures.length === 1 ? g.failures[0].message : g.failures.length > 1 ? failureSummary : null,
            resultEntityId: null,
        };
    });

    groups.sort((a, b) => a.rowNumber - b.rowNumber);

    const qNorm = q?.trim();
    if (qNorm) {
        const ql = qNorm.toLowerCase();
        groups = groups.filter((row) => {
            const p = row.rawPayload || {};
            const hay = [
                p.name,
                p.email,
                p.department_name,
                p.allocation_type_names_csv,
                row.errorMessage,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(ql);
        });
    }

    const total = groups.length;
    const skip = (page - 1) * limit;
    const data = groups.slice(skip, skip + limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

/**
 * For leave balance update jobs, return one logical row per employee with
 * comma-separated leave type names (for UI). Search `q` is applied after aggregation.
 */
async function getAggregatedLeaveBalanceBatchRows({
    tenantId,
    jobId,
    status,
    q,
    page,
    limit,
}) {
    const where = {
        batchJobId: jobId,
        ...(status && ["PENDING", "SUCCESS", "FAILED", "SKIPPED"].includes(status) && { status }),
    };

    const allRows = await prisma.batchJobRow.findMany({
        where,
        orderBy: { rowNumber: "asc" },
        take: MAX_ALLOCATION_ROWS_FOR_AGGREGATE,
        select: {
            id: true,
            rowNumber: true,
            status: true,
            rawPayload: true,
            errorMessage: true,
            resultEntityId: true,
        },
    });

    const userIdCandidates = new Set();

    for (const r of allRows) {
        const payload = r.rawPayload && typeof r.rawPayload === "object" ? r.rawPayload : {};
        const uid = r.resultEntityId ?? payload.userId ?? payload.userid ?? payload.user_id;
        if (uid) userIdCandidates.add(String(uid));
    }

    const users = userIdCandidates.size > 0
        ? await prisma.user.findMany({
            where: {
                id: { in: Array.from(userIdCandidates) },
                tenantId,
                isDeleted: false,
            },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                department: { select: { name: true } },
            },
        })
        : [];

    const userById = new Map(users.map((u) => [u.id, u]));

    // Get leave types for names
    const leaveTypeIds = new Set();
    for (const r of allRows) {
        const payload = r.rawPayload && typeof r.rawPayload === "object" ? r.rawPayload : {};
        const ltId = payload.leaveTypeId || payload.leave_type_id || payload.leavetypeid;
        if (ltId) leaveTypeIds.add(String(ltId));
    }

    const leaveTypes = leaveTypeIds.size > 0
        ? await prisma.leaveType.findMany({
            where: {
                id: { in: Array.from(leaveTypeIds) },
                tenantId,
            },
            select: {
                id: true,
                name: true,
            },
        })
        : [];

    const leaveTypeById = new Map(leaveTypes.map((lt) => [lt.id, lt]));

    const enrichedRows = allRows.map((r) => {
        const payload = r.rawPayload && typeof r.rawPayload === "object" ? { ...r.rawPayload } : {};
        const uid = r.resultEntityId ?? payload.userId ?? payload.userid ?? payload.user_id;
        const lookupId = uid ? String(uid) : null;
        const u = lookupId ? userById.get(lookupId) : undefined;

        const ltId = payload.leaveTypeId || payload.leave_type_id || payload.leavetypeid;
        const leaveType = ltId ? leaveTypeById.get(String(ltId)) : undefined;

        const merged = {
            ...payload,
            leaveTypeName: leaveType?.name || "Unknown leave type",
        };
        if (u) {
            merged.name = payload.name ?? u.name ?? u.email;
            merged.email = payload.email ?? u.email;
            merged.department_name = payload.department_name ?? u.department?.name ?? "";
            merged.image = payload.image ?? u.image ?? null;
        }

        return { ...r, rawPayload: merged };
    });

    /** @type {Map<string, { minRow: number, rows: typeof enrichedRows, seenLeaveTypeIds: Set<string>, orderedLeaveTypeNames: string[], failures: { leaveTypeName: string, message: string }[] }>} */
    const byUser = new Map();

    for (const r of enrichedRows) {
        const p = r.rawPayload || {};
        const uidRaw = r.resultEntityId ?? p.userId ?? p.userid ?? p.user_id;
        const uid = uidRaw ? String(uidRaw) : "__unknown__";

        if (!byUser.has(uid)) {
            byUser.set(uid, {
                minRow: r.rowNumber,
                rows: [],
                seenLeaveTypeIds: new Set(),
                orderedLeaveTypeNames: [],
                failures: [],
            });
        }
        const g = byUser.get(uid);
        g.minRow = Math.min(g.minRow, r.rowNumber);
        g.rows.push(r);

        const ltId = p.leaveTypeId || p.leave_type_id || p.leavetypeid;
        const ltKey = `lt:${String(ltId || "unknown")}`;

        if (!g.seenLeaveTypeIds.has(ltKey)) {
            g.seenLeaveTypeIds.add(ltKey);
            g.orderedLeaveTypeNames.push(p.leaveTypeName || "Unknown leave type");
        }

        if (r.status === "FAILED" && r.errorMessage) {
            g.failures.push({
                leaveTypeName: p.leaveTypeName || "Unknown leave type",
                message: r.errorMessage,
            });
        }
    }

    let groups = Array.from(byUser.entries()).map(([uid, g]) => {
        const representative = g.rows.reduce((best, cur) =>
            cur.rowNumber < best.rowNumber ? cur : best
        );
        const p = representative.rawPayload || {};
        const leaveTypeNamesCsv = g.orderedLeaveTypeNames.join(", ");
        const failureSummary =
            g.failures.length > 0 ? g.failures.map((f) => `${f.leaveTypeName}: ${f.message}`).join("\n") : "";

        // Determine overall status: if any row failed, the group is FAILED
        const hasFailure = g.rows.some((r) => r.status === "FAILED");
        const allPending = g.rows.every((r) => r.status === "PENDING");
        const overallStatus = hasFailure ? "FAILED" : (allPending ? "PENDING" : "SUCCESS");

        return {
            id: `agg:${jobId}:${uid}`,
            rowNumber: g.minRow,
            status: overallStatus,
            rawPayload: {
                ...p,
                userId: uid === "__unknown__" ? undefined : uid,
                leave_balance_leave_types_csv: leaveTypeNamesCsv,
                leave_balance_failure_details: failureSummary || undefined,
            },
            errorMessage: g.failures.length === 1 ? g.failures[0].message : g.failures.length > 1 ? failureSummary : null,
            resultEntityId: uid === "__unknown__" ? null : uid,
        };
    });

    groups.sort((a, b) => a.rowNumber - b.rowNumber);

    const qNorm = q?.trim();
    if (qNorm) {
        const ql = qNorm.toLowerCase();
        groups = groups.filter((row) => {
            const p = row.rawPayload || {};
            const hay = [
                p.name,
                p.email,
                p.department_name,
                p.leave_balance_leave_types_csv,
                row.errorMessage,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return hay.includes(ql);
        });
    }

    const total = groups.length;
    const skip = (page - 1) * limit;
    const data = groups.slice(skip, skip + limit);

    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        },
    };
}

/**
 * Process a batch job by executing its rows in parallel with configurable concurrency.
 * Supports partial success: failed rows are marked FAILED and processing continues.
 */

export const getBatchJobRows = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { id } = req.params;
        const job = await prisma.batchJob.findFirst({
            where: { id, tenantId },
            select: { id: true, type: true },
        });
        if (!job) {
            return res.status(404).json({ success: false, message: "Batch job not found" });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const skip = (page - 1) * limit;
        const status = req.query.status?.toUpperCase();
        const q = req.query.q?.trim();

        if (job.type === "ALLOWANCE_ALLOCATION" || job.type === "DEDUCTION_ALLOCATION") {
            const { data, pagination } = await getAggregatedAllocationBatchRows({
                tenantId,
                jobId: id,
                jobType: job.type,
                status,
                q,
                page,
                limit,
            });
            return res.json({
                success: true,
                data,
                pagination,
                meta: { aggregatedByUser: true, rowCap: MAX_ALLOCATION_ROWS_FOR_AGGREGATE },
            });
        }

        if (job.type === "BULK_UPDATE") {
            const { data, pagination } = await getAggregatedBulkUpdateBatchRows({
                tenantId,
                jobId: id,
                status,
                q,
                page,
                limit,
            });
            return res.json({
                success: true,
                data,
                pagination,
                meta: { aggregatedByUser: true, rowCap: MAX_ALLOCATION_ROWS_FOR_AGGREGATE },
            });
        }

        const where = {
            batchJobId: id,
            ...(status && ["PENDING", "SUCCESS", "FAILED", "SKIPPED"].includes(status) && { status }),
            ...(q && {
                OR: [
                    { errorMessage: { contains: q, mode: "insensitive" } },
                    { resultEntityId: { contains: q, mode: "insensitive" } },
                ],
            }),
        };

        const [rows, total] = await Promise.all([
            prisma.batchJobRow.findMany({
                where,
                skip,
                take: limit,
                orderBy: { rowNumber: "asc" },
            }),
            prisma.batchJobRow.count({ where }),
        ]);

        const wantsUserEnrichment =
            job.type === "BULK_UPDATE" || job.type === "EMPLOYEE_CREATION";

        if (wantsUserEnrichment && rows.length > 0) {
            const userIdCandidates = new Set();

            for (const r of rows) {
                const payload = r.rawPayload && typeof r.rawPayload === "object" ? r.rawPayload : {};
                const fallbackUserId = r.resultEntityId ?? null;
                if (fallbackUserId) userIdCandidates.add(String(fallbackUserId));
            }

            const userIds = Array.from(userIdCandidates);
            if (userIds.length > 0) {
                const users = await prisma.user.findMany({
                    where: {
                        id: { in: userIds },
                        tenantId,
                        isDeleted: false,
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                        department: { select: { name: true } },
                    },
                });

                const userById = new Map(users.map((u) => [u.id, u]));

                for (const r of rows) {
                    const payload = r.rawPayload && typeof r.rawPayload === "object" ? r.rawPayload : {};
                    const lookupId = r.resultEntityId ?? null;

                    const u = lookupId ? userById.get(String(lookupId)) : undefined;
                    if (!u) continue;

                    r.rawPayload = {
                        ...payload,
                        name: payload.name ?? u.name ?? u.email,
                        email: payload.email ?? u.email,
                        department_name: payload.department_name ?? u.department?.name ?? "",
                        image: payload.image ?? u.image ?? null,
                    };
                }
            }
        }

        return res.json({
            success: true,
            data: rows,
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        });
    } catch (e) {
        logger.error(`getBatchJobRows: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to fetch rows" });
    }
};

export const exportBatchJobRows = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { id } = req.params;
        const job = await prisma.batchJob.findFirst({
            where: { id, tenantId },
            select: { id: true, batchCode: true },
        });
        if (!job) {
            return res.status(404).json({ success: false, message: "Batch job not found" });
        }

        const rows = await prisma.batchJobRow.findMany({
            where: { batchJobId: id },
            orderBy: { rowNumber: "asc" },
        });

        const text = csvTextForBatchJobRows(job, rows);

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${job.batchCode}-rows.csv"`);
        return res.send(text);
    } catch (e) {
        logger.error(`exportBatchJobRows: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Export failed" });
    }
};

/**
 * GET /api/batch-jobs/export — ZIP of CSVs for all jobs matching list filters (or `ids` only).
 * Must be registered before router.get("/:id/export", …).
 */
export const exportBatchJobsBulkZip = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        if (!tenantId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const idsParam = typeof req.query.ids === "string" ? req.query.ids.trim() : "";

        let where;
        let orderBy = { createdAt: "desc" };

        if (idsParam) {
            const idList = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
            if (idList.length === 0) {
                return res.status(400).json({ success: false, message: "No batch ids provided" });
            }
            where = { tenantId, id: { in: idList } };
        } else {
            const statusFilter = req.query.status;
            const q = req.query.q?.trim();
            const createdByUserId = (req.query.createdBy ?? req.query.createdByUserId)?.trim();

            where = {
                tenantId,
                ...(statusFilter &&
                    ["pending", "processing", "completed", "failed"].includes(statusFilter) && {
                        status: statusFilter.toUpperCase(),
                    }),
                ...(q && {
                    OR: [{ batchCode: { contains: q, mode: "insensitive" } }],
                }),
                ...(createdByUserId && { createdByUserId }),
            };

            const sortByRaw =
                typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "";
            const sortOrderRaw =
                typeof req.query.sortOrder === "string"
                    ? req.query.sortOrder.trim().toLowerCase()
                    : "";
            const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";

            if (sortByRaw === "type") {
                orderBy = { type: sortOrder };
            } else if (sortByRaw === "totalRows") {
                orderBy = { totalRows: sortOrder };
            } else {
                orderBy = { createdAt: sortOrder };
            }
        }

        const total = await prisma.batchJob.count({ where });
        if (total === 0) {
            return res.status(404).json({
                success: false,
                message: idsParam
                    ? "No batch jobs to export for the selected ids."
                    : "No batch jobs to export for the current filters.",
            });
        }
        if (total > MAX_BATCH_BULK_EXPORT) {
            return res.status(400).json({
                success: false,
                message: `Too many batch jobs (${total}). Narrow filters or export at most ${MAX_BATCH_BULK_EXPORT}.`,
            });
        }

        const jobs = await prisma.batchJob.findMany({
            where,
            orderBy,
            take: MAX_BATCH_BULK_EXPORT,
            select: { id: true, batchCode: true },
        });

        const zipName = `batch-jobs-${new Date().toISOString().slice(0, 10)}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", (err) => {
            logger.error(`exportBatchJobsBulkZip archive: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: "Export failed" });
            }
        });
        archive.pipe(res);

        for (const job of jobs) {
            const rows = await prisma.batchJobRow.findMany({
                where: { batchJobId: job.id },
                orderBy: { rowNumber: "asc" },
            });
            const safeCode = String(job.batchCode || job.id).replace(/[/\\?%*:|"<>]/g, "_");
            archive.append(csvTextForBatchJobRows(job, rows), {
                name: `${safeCode}-rows.csv`,
            });
        }

        const manifest = {
            exportedAt: new Date().toISOString(),
            jobCount: jobs.length,
            query: idsParam
                ? { ids: idsParam }
                : {
                      status: req.query.status ?? "",
                      q: req.query.q ?? "",
                      createdBy: req.query.createdBy ?? req.query.createdByUserId ?? "",
                      sortBy: req.query.sortBy ?? "",
                      sortOrder: req.query.sortOrder ?? "",
                  },
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: "export-manifest.json" });

        await archive.finalize();
    } catch (e) {
        logger.error(`exportBatchJobsBulkZip: ${e.message}`, { stack: e.stack });
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: "Export failed" });
        }
    }
};

async function createBatchFromParsedRows({
    tenantId,
    createdByUserId,
    type,
    originalFilename,
    fileSizeBytes,
    headers,
    dataRows,
    requiredHeaders,
    actorRole,
}) {
    const hv = validateHeaders(headers, requiredHeaders);
    if (!hv.ok) {
        return { error: { status: 400, body: { success: false, message: "Missing CSV headers", missingHeaders: hv.missing } } };
    }

    const batchCode = await generateBatchCode(tenantId);
    const job = await prisma.batchJob.create({
        data: {
            tenantId,
            createdByUserId,
            type,
            status: "PENDING",
            batchCode,
            originalFilename: originalFilename || null,
            fileSizeBytes: fileSizeBytes ?? null,
            totalRows: dataRows.length,
            inputJson: { actorRole },
        },
    });

    const rowCreates = dataRows.map((rawPayload, i) => ({
        batchJobId: job.id,
        rowNumber: i + 1,
        status: "PENDING",
        rawPayload,
    }));

    if (rowCreates.length > 0) {
        await prisma.batchJobRow.createMany({ data: rowCreates });
    }

    return { job };
}

export const createEmployeeCreationBatch = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, message: "CSV file is required (field: file)" });
        }
        const { headers, rows } = parseCsvBuffer(req.file.buffer);
        const result = await createBatchFromParsedRows({
            tenantId,
            createdByUserId: req.user.id,
            type: "EMPLOYEE_CREATION",
            originalFilename: req.file.originalname,
            fileSizeBytes: req.file.size,
            headers,
            dataRows: rows,
            requiredHeaders: ["name", "email", "base_salary"],
            actorRole: req.user.role,
        });
        if (result.error) {
            return res.status(result.error.status).json(result.error.body);
        }
        const processingMode = await beginBatchJobProcessing(result.job.id);
        return res.status(201).json({
            success: true,
            data: {
                id: result.job.id,
                batchCode: result.job.batchCode,
                totalRows: rows.length,
                processingMode,
            },
        });
    } catch (e) {
        logger.error(`createEmployeeCreationBatch: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: e.message || "Failed to create batch" });
    }
};

export const createEmployeeInvitationBatch = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, message: "CSV file is required (field: file)" });
        }
        const { headers, rows } = parseCsvBuffer(req.file.buffer);
        const result = await createBatchFromParsedRows({
            tenantId,
            createdByUserId: req.user.id,
            type: "EMPLOYEE_INVITATION",
            originalFilename: req.file.originalname,
            fileSizeBytes: req.file.size,
            headers,
            dataRows: rows,
            requiredHeaders: ["email", "role"],
            actorRole: req.user.role,
        });
        if (result.error) {
            return res.status(result.error.status).json(result.error.body);
        }
        const processingMode = await beginBatchJobProcessing(result.job.id);
        return res.status(201).json({
            success: true,
            data: {
                id: result.job.id,
                batchCode: result.job.batchCode,
                totalRows: rows.length,
                processingMode,
            },
        });
    } catch (e) {
        logger.error(`createEmployeeInvitationBatch: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: e.message || "Failed to create batch" });
    }
};

export const createSendInvitationsBatch = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const employeeIds = Array.isArray(req.body?.employeeIds) ? req.body.employeeIds : [];
        const normalizedEmployeeIds = Array.from(
            new Set(
                employeeIds
                    .map((v) => String(v || "").trim())
                    .filter(Boolean)
            )
        );

        if (normalizedEmployeeIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "employeeIds[] is required",
            });
        }
        if (normalizedEmployeeIds.length > 500) {
            return res.status(400).json({
                success: false,
                message: "A maximum of 500 employees can be processed per batch",
            });
        }

        const batchCode = await generateBatchCode(tenantId);
        const job = await prisma.batchJob.create({
            data: {
                tenantId,
                createdByUserId: req.user.id,
                type: "EMPLOYEE_INVITATION",
                status: "PENDING",
                batchCode,
                totalRows: normalizedEmployeeIds.length,
                inputJson: {
                    actorRole: req.user.role,
                    source: "DIRECTORY_SETUP_INVITATION",
                },
            },
        });

        const rowCreates = normalizedEmployeeIds.map((employeeId, i) => ({
            batchJobId: job.id,
            rowNumber: i + 1,
            status: "PENDING",
            rawPayload: { employeeId },
        }));

        if (rowCreates.length > 0) {
            await prisma.batchJobRow.createMany({ data: rowCreates });
        }

        const processingMode = await beginBatchJobProcessing(job.id);
        return res.status(201).json({
            success: true,
            data: {
                id: job.id,
                batchCode: job.batchCode,
                totalRows: rowCreates.length,
                processingMode,
            },
        });
    } catch (e) {
        logger.error(`createSendInvitationsBatch: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: e.message || "Failed to create batch" });
    }
};

export const createBulkUpdateBatch = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, message: "CSV file is required (field: file)" });
        }
        const { headers, rows } = parseCsvBuffer(req.file.buffer);
        const hv = validateHeaders(headers, ["field", "value"]);
        if (!hv.ok) {
            return res.status(400).json({
                success: false,
                message: "Missing CSV headers",
                missingHeaders: hv.missing,
            });
        }
        const badRow = rows.find(
            (r) =>
                !pickRow(r, "employee_id", "employeeId", "employeeid") && !pickRow(r, "email")
        );
        if (badRow) {
            return res.status(400).json({
                success: false,
                message: "Each row must include employee_id or email",
            });
        }

        const result = await createBatchFromParsedRows({
            tenantId,
            createdByUserId: req.user.id,
            type: "BULK_UPDATE",
            originalFilename: req.file.originalname,
            fileSizeBytes: req.file.size,
            headers,
            dataRows: rows,
            requiredHeaders: ["field", "value"],
            actorRole: req.user.role,
        });
        if (result.error) {
            return res.status(result.error.status).json(result.error.body);
        }
        const processingMode = await beginBatchJobProcessing(result.job.id);
        return res.status(201).json({
            success: true,
            data: {
                id: result.job.id,
                batchCode: result.job.batchCode,
                totalRows: rows.length,
                processingMode,
            },
        });
    } catch (e) {
        logger.error(`createBulkUpdateBatch: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: e.message || "Failed to create batch" });
    }
};

export const createAllowanceAllocationBatch = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { lines } = req.body || {};
        const normalizedLines = Array.isArray(lines)
            ? dedupeAllocationLines(lines, "allowanceTypeId")
            : [];
        if (normalizedLines.length === 0) {
            return res.status(400).json({ success: false, message: "lines[] is required" });
        }

        const batchCode = await generateBatchCode(tenantId);
        const job = await prisma.batchJob.create({
            data: {
                tenantId,
                createdByUserId: req.user.id,
                type: "ALLOWANCE_ALLOCATION",
                status: "PENDING",
                batchCode,
                totalRows: normalizedLines.length,
                inputJson: { actorRole: req.user.role },
            },
        });

        const rowCreates = normalizedLines.map((line, i) => ({
            batchJobId: job.id,
            rowNumber: i + 1,
            status: "PENDING",
            rawPayload: line,
        }));
        await prisma.batchJobRow.createMany({ data: rowCreates });

        const processingMode = await beginBatchJobProcessing(job.id);
        return res.status(201).json({
            success: true,
            data: { id: job.id, batchCode: job.batchCode, totalRows: normalizedLines.length, processingMode },
        });
    } catch (e) {
        logger.error(`createAllowanceAllocationBatch: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to create batch" });
    }
};

export const createDeductionAllocationBatch = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { lines } = req.body || {};
        const normalizedLines = Array.isArray(lines)
            ? dedupeAllocationLines(lines, "deductionTypeId")
            : [];
        if (normalizedLines.length === 0) {
            return res.status(400).json({ success: false, message: "lines[] is required" });
        }

        const batchCode = await generateBatchCode(tenantId);
        const job = await prisma.batchJob.create({
            data: {
                tenantId,
                createdByUserId: req.user.id,
                type: "DEDUCTION_ALLOCATION",
                status: "PENDING",
                batchCode,
                totalRows: normalizedLines.length,
                inputJson: { actorRole: req.user.role },
            },
        });

        const rowCreates = normalizedLines.map((line, i) => ({
            batchJobId: job.id,
            rowNumber: i + 1,
            status: "PENDING",
            rawPayload: line,
        }));
        await prisma.batchJobRow.createMany({ data: rowCreates });

        const processingMode = await beginBatchJobProcessing(job.id);
        return res.status(201).json({
            success: true,
            data: { id: job.id, batchCode: job.batchCode, totalRows: normalizedLines.length, processingMode },
        });
    } catch (e) {
        logger.error(`createDeductionAllocationBatch: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to create batch" });
    }
};

export const createLeaveBalanceUpdateBatch = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { lines } = req.body || {};
        const normalizedLines = Array.isArray(lines)
            ? dedupeAllocationLines(lines, "leaveTypeId")
            : [];
        if (normalizedLines.length === 0) {
            return res.status(400).json({ success: false, message: "lines[] is required" });
        }

        const batchCode = await generateBatchCode(tenantId);
        const job = await prisma.batchJob.create({
            data: {
                tenantId,
                createdByUserId: req.user.id,
                type: "LEAVE_BALANCE_UPDATE",
                status: "PENDING",
                batchCode,
                totalRows: normalizedLines.length,
                inputJson: { actorRole: req.user.role },
            },
        });

        const rowCreates = normalizedLines.map((line, i) => ({
            batchJobId: job.id,
            rowNumber: i + 1,
            status: "PENDING",
            rawPayload: line,
        }));
        await prisma.batchJobRow.createMany({ data: rowCreates });

        const processingMode = await beginBatchJobProcessing(job.id);
        return res.status(201).json({
            success: true,
            data: { id: job.id, batchCode: job.batchCode, totalRows: normalizedLines.length, processingMode },
        });
    } catch (e) {
        logger.error(`createLeaveBalanceUpdateBatch: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to create batch" });
    }
};

export const startBatchJob = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { id } = req.params;

        const job = await prisma.batchJob.findFirst({ where: { id, tenantId } });
        if (!job) {
            return res.status(404).json({ success: false, message: "Batch job not found" });
        }
        if (job.status !== "PENDING") {
            return res.status(400).json({ success: false, message: "Only pending jobs can be started" });
        }

        const mode = await beginBatchJobProcessing(id);

        return res.json({
            success: true,
            data: { id, status: "processing", processingMode: mode },
        });
    } catch (e) {
        logger.error(`startBatchJob: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to start batch job" });
    }
};

export const retryBatchJob = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { id } = req.params;

        const job = await prisma.batchJob.findFirst({ where: { id, tenantId } });
        if (!job) {
            return res.status(404).json({ success: false, message: "Batch job not found" });
        }
        if (job.status !== "FAILED") {
            return res.status(400).json({ success: false, message: "Only failed jobs can be retried" });
        }

        await prisma.batchJobRow.updateMany({
            where: { batchJobId: id, status: "FAILED" },
            data: {
                status: "PENDING",
                errorMessage: null,
                errorField: null,
            },
        });

        await prisma.batchJob.update({
            where: { id },
            data: {
                status: "PENDING",
                failureReason: null,
                processCompletedAt: null,
            },
        });

        return res.json({ success: true, message: "Batch job reset; call start to process again" });
    } catch (e) {
        logger.error(`retryBatchJob: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Retry failed" });
    }
};

/** GET /api/batch-jobs/:id/status — lightweight JSON for polling (same shape as SSE snapshots). */
export const getBatchJobStatus = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { id } = req.params;
        const job = await prisma.batchJob.findFirst({ where: { id, tenantId } });
        if (!job) {
            return res.status(404).json({ success: false, message: "Batch job not found" });
        }
        const total = job.totalRows || 0;
        const completed = job.processedCount || 0;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
        return res.json({
            success: true,
            data: {
                status: batchStatusToApi(job.status),
                progress: {
                    completed,
                    total,
                    failed: job.failedCount ?? 0,
                    success: job.successCount ?? 0,
                    percentage,
                },
            },
        });
    } catch (e) {
        logger.error(`getBatchJobStatus: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to fetch batch job status" });
    }
};

export const getBatchJobStatusStream = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { id } = req.params;

        const job = await prisma.batchJob.findFirst({ where: { id, tenantId } });
        if (!job) {
            return res.status(404).json({ success: false, message: "Batch job not found" });
        }

        const sse = createSSEConnection(res, () => {
            logger.info(`SSE closed for batch job ${id}`);
        });

        const sendSnapshot = (j) => {
            const total = j.totalRows || 0;
            const completed = j.processedCount || 0;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
            sse.send({
                status: batchStatusToApi(j.status),
                progress: {
                    completed,
                    total,
                    failed: j.failedCount ?? 0,
                    success: j.successCount ?? 0,
                    percentage,
                },
            });
        };

        sendSnapshot(job);

        const pollInterval = setInterval(async () => {
            try {
                const current = await prisma.batchJob.findFirst({ where: { id, tenantId } });
                if (!current) {
                    clearInterval(pollInterval);
                    sse.close();
                    return;
                }
                sendSnapshot(current);
                const st = current.status;
                if (st === "COMPLETED" || st === "FAILED") {
                    clearInterval(pollInterval);
                    sse.close();
                }
            } catch (pollErr) {
                logger.error(`Batch SSE poll: ${pollErr.message}`);
            }
        }, 2000);

        res.on("close", () => {
            clearInterval(pollInterval);
        });
    } catch (e) {
        logger.error(`getBatchJobStatusStream: ${e.message}`, { stack: e.stack });
        if (!res.headersSent) {
            return res.status(500).json({ success: false, message: "SSE failed" });
        }
    }
};
