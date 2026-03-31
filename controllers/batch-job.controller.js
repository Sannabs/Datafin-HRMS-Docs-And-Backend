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

function tenantIdFromReq(req) {
    return req.effectiveTenantId ?? req.user?.tenantId;
}

function validateHeaders(headers, required) {
    const hset = new Set(headers.map((h) => h.toLowerCase()));
    const missing = required.filter((r) => !hset.has(r.toLowerCase()));
    return { ok: missing.length === 0, missing };
}

function pickRow(row, ...keys) {
    for (const k of keys) {
        const v = row[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
}

/**
 * CSV preflight: empty file + required headers only. Returns a result object to return immediately, or null to run deep validation.
 * @param {"EMPLOYEE_CREATION"|"EMPLOYEE_INVITATION"|"BULK_UPDATE"} batchType
 */
function csvPreflightBatchCsv(batchType, headers, rows) {
    if (rows.length === 0) {
        return {
            total_records: 0,
            valid_records: 0,
            invalid_records: 0,
            errors: [{ row_number: 1, field: "file", message: "CSV has no data rows", value: "" }],
        };
    }

    let required;
    if (batchType === "EMPLOYEE_CREATION") required = ["name", "email", "base_salary"];
    else if (batchType === "EMPLOYEE_INVITATION") required = ["email", "role"];
    else if (batchType === "BULK_UPDATE") required = ["field", "value"];
    else {
        return {
            total_records: rows.length,
            valid_records: 0,
            invalid_records: rows.length,
            errors: [{ row_number: 0, field: "batchType", message: "Invalid batch type", value: String(batchType) }],
        };
    }

    const hv = validateHeaders(headers, required);
    if (!hv.ok) {
        return {
            total_records: rows.length,
            valid_records: 0,
            invalid_records: rows.length,
            errors: [
                {
                    row_number: 1,
                    field: "headers",
                    message: `Missing required column(s): ${hv.missing.join(", ")}`,
                    value: "",
                },
            ],
            missingHeaders: hv.missing,
        };
    }

    return null;
}

async function tryEnqueueOrInline(batchJobId) {
    if (ENABLE_BULLMQ) {
        try {
            getBatchQueue();
            await enqueueBatchJob(batchJobId);
            return "queued";
        } catch (e) {
            logger.warn(`Batch queue unavailable, processing inline: ${e.message}`);
        }
    }
    setImmediate(() => {
        processBatchJobById(batchJobId).catch((err) => {
            logger.error(`Inline batch process failed ${batchJobId}: ${err.message}`, { stack: err.stack });
        });
    });
    return "inline";
}

async function beginBatchJobProcessing(batchJobId) {
    await prisma.batchJob.update({
        where: { id: batchJobId },
        data: {
            status: "PROCESSING",
            processStartedAt: new Date(),
            failureReason: null,
        },
    });
    return tryEnqueueOrInline(batchJobId);
}

export const listBatchJobs = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        if (!tenantId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const skip = (page - 1) * limit;
        const statusFilter = req.query.status;
        const q = req.query.q?.trim();
        const createdByUserId = (req.query.createdBy ?? req.query.createdByUserId)?.trim();

        const where = {
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

        const [jobs, total] = await Promise.all([
            prisma.batchJob.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    createdByUser: {
                        select: { id: true, name: true, email: true, image: true, role: true },
                    },
                },
            }),
            prisma.batchJob.count({ where }),
        ]);

        return res.json({
            success: true,
            data: jobs.map((j) => mapBatchJobToListItem(j)),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.max(1, Math.ceil(total / limit)),
            },
        });
    } catch (e) {
        logger.error(`listBatchJobs: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to list batch jobs" });
    }
};

export const listBatchJobCreators = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        if (!tenantId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const rows = await prisma.batchJob.findMany({
            where: { tenantId },
            select: { createdByUserId: true },
        });
        const seen = new Set();
        const ids = [];
        for (const r of rows) {
            if (r.createdByUserId && !seen.has(r.createdByUserId)) {
                seen.add(r.createdByUserId);
                ids.push(r.createdByUserId);
            }
        }
        if (ids.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const users = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, email: true },
            orderBy: [{ name: "asc" }, { email: "asc" }],
        });
        return res.json({ success: true, data: users });
    } catch (e) {
        logger.error(`listBatchJobCreators: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to list creators" });
    }
};

export const validateBatchCsv = async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, message: "CSV file is required (field: file)" });
        }
        const raw = String(req.body?.batchType || req.body?.batch_type || "").trim();
        const normalized = raw.toUpperCase().replace(/-/g, "_");
        const allowed = ["EMPLOYEE_CREATION", "EMPLOYEE_INVITATION", "BULK_UPDATE"];
        if (!allowed.includes(normalized)) {
            return res.status(400).json({
                success: false,
                message: "batchType must be employee_creation, employee_invitation, or bulk_update",
            });
        }
        const tenantId = tenantIdFromReq(req);
        if (!tenantId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }
        const { headers, rows } = parseCsvBuffer(req.file.buffer);
        const pre = csvPreflightBatchCsv(normalized, headers, rows);
        if (pre) {
            return res.json({ success: true, data: pre });
        }
        const data = await deepValidateCsvRowsForBatch({
            tenantId,
            actorRole: req.user?.role,
            batchType: normalized,
            rows,
        });
        return res.json({ success: true, data });
    } catch (e) {
        logger.error(`validateBatchCsv: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: e.message || "Validation failed" });
    }
};

export const getBatchJobById = async (req, res) => {
    try {
        const tenantId = tenantIdFromReq(req);
        const { id } = req.params;
        const job = await prisma.batchJob.findFirst({
            where: { id, tenantId },
            include: {
                createdByUser: {
                    select: { id: true, name: true, email: true, image: true, role: true },
                },
            },
        });
        if (!job) {
            return res.status(404).json({ success: false, message: "Batch job not found" });
        }
        return res.json({ success: true, data: mapBatchJobToListItem(job) });
    } catch (e) {
        logger.error(`getBatchJobById: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Failed to fetch batch job" });
    }
};

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
            job.type === "ALLOWANCE_ALLOCATION" ||
            job.type === "DEDUCTION_ALLOCATION" ||
            job.type === "BULK_UPDATE" ||
            job.type === "EMPLOYEE_CREATION"

        if (wantsUserEnrichment && rows.length > 0) {
            const userIdCandidates = new Set();

            for (const r of rows) {
                const payload = r.rawPayload && typeof r.rawPayload === "object" ? r.rawPayload : {};

                // For allocation batches, we receive `userId` in rawPayload.
                const allocationUserId =
                    payload.userId ?? payload.userid ?? payload.user_id;

                const fallbackUserId = r.resultEntityId ?? null;

                if (job.type === "ALLOWANCE_ALLOCATION" || job.type === "DEDUCTION_ALLOCATION") {
                    if (allocationUserId) userIdCandidates.add(String(allocationUserId));
                } else {
                    if (fallbackUserId) userIdCandidates.add(String(fallbackUserId));
                }
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
                    const lookupId =
                        job.type === "ALLOWANCE_ALLOCATION" || job.type === "DEDUCTION_ALLOCATION"
                            ? payload.userId ?? payload.userid ?? payload.user_id
                            : r.resultEntityId ?? null;

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

        const header = ["row_number", "status", "error_field", "error_message", "result_entity_id"];
        const lines = [header.join(",")];
        for (const r of rows) {
            const cells = [
                r.rowNumber,
                r.status,
                r.errorField || "",
                (r.errorMessage || "").replace(/"/g, '""'),
                r.resultEntityId || "",
            ].map((c) => (typeof c === "string" && c.includes(",") ? `"${c}"` : c));
            lines.push(cells.join(","));
        }

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${job.batchCode}-rows.csv"`);
        return res.send(lines.join("\n"));
    } catch (e) {
        logger.error(`exportBatchJobRows: ${e.message}`, { stack: e.stack });
        return res.status(500).json({ success: false, message: "Export failed" });
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
        if (!Array.isArray(lines) || lines.length === 0) {
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
                totalRows: lines.length,
                inputJson: { actorRole: req.user.role },
            },
        });

        const rowCreates = lines.map((line, i) => ({
            batchJobId: job.id,
            rowNumber: i + 1,
            status: "PENDING",
            rawPayload: line,
        }));
        await prisma.batchJobRow.createMany({ data: rowCreates });

        const processingMode = await beginBatchJobProcessing(job.id);
        return res.status(201).json({
            success: true,
            data: { id: job.id, batchCode: job.batchCode, totalRows: lines.length, processingMode },
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
        if (!Array.isArray(lines) || lines.length === 0) {
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
                totalRows: lines.length,
                inputJson: { actorRole: req.user.role },
            },
        });

        const rowCreates = lines.map((line, i) => ({
            batchJobId: job.id,
            rowNumber: i + 1,
            status: "PENDING",
            rawPayload: line,
        }));
        await prisma.batchJobRow.createMany({ data: rowCreates });

        const processingMode = await beginBatchJobProcessing(job.id);
        return res.status(201).json({
            success: true,
            data: { id: job.id, batchCode: job.batchCode, totalRows: lines.length, processingMode },
        });
    } catch (e) {
        logger.error(`createDeductionAllocationBatch: ${e.message}`, { stack: e.stack });
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
