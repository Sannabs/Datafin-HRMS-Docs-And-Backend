import {
  EmployeeWarningCategory,
  EmployeeWarningSeverity,
  EmployeeWarningStatus,
  EmployeeWarningAppealOutcome,
  ActionEnum,
} from "@prisma/client";
import prisma from "../config/prisma.config.js";
import { EMPLOYEE_STATUSES_ACTIVE_FOR_WORK } from "../utils/employee-status.util.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import logger from "../utils/logger.js";
import {
  assertCanViewEmployeeWarnings,
  assertCanCreateOrMutateNonIssuedWarning,
  assertCanSubmitWarning,
  assertCanIssueWarning,
  assertCanEditDraft,
  getTenantId,
  assertCanActAsWarningEmployee,
  assertCanReviewAppeal,
  assertCanResolveVoidEscalate,
  assertCanExportWarningFormalPackage,
  getManagedDepartmentIds,
} from "../utils/employee-warning-access.js";
import { getWarningEscalationSummaryForEmployee } from "../utils/employee-warning-escalation.js";
import archiver from "archiver";
import {
  createNotification,
  notifyHRForWarningEvent,
} from "../services/notification.service.js";
import { generateWarningLetterPdfBuffer } from "../services/warning-letter-pdf.service.js";
import { mapAuditLogToTimelineEvent } from "../utils/employee-warning-timeline.js";
import { sendWarningIssuedEmail } from "../views/sendWarningIssuedEmail.js";
import { sendWarningSubmittedForReviewEmail } from "../views/sendWarningSubmittedForReviewEmail.js";
import {
  uploadFile,
  generateFilename,
  extractFilenameFromUrl,
  deleteFile,
  getFile,
} from "../config/storage.config.js";

const warningUserActorSelect = {
  select: {
    id: true,
    name: true,
    employeeId: true,
  },
};

const warningWithAttachmentsInclude = {
  attachments: { orderBy: { createdAt: "desc" } },
  createdBy: warningUserActorSelect,
  issuedBy: warningUserActorSelect,
};

function warningActorDisplayName(user) {
  if (!user) return null;
  const name =
    typeof user.name === "string" ? user.name.trim() : "";
  if (name) return name;
  const eid =
    typeof user.employeeId === "string" ? user.employeeId.trim() : "";
  return eid || null;
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

function attachmentToDto(a) {
  return {
    id: a.id,
    tenantId: a.tenantId,
    employeeWarningId: a.employeeWarningId,
    originalName: a.originalName,
    storedName: a.storedName,
    filePath: a.filePath,
    mimeType: a.mimeType,
    extension: a.extension,
    sizeBytes: a.sizeBytes,
    uploadedBy: a.uploadedBy,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

/**
 * Field immutability (aligned to docs — employee-warning-flow.md §3.6):
 * - Core case facts (title, category, severity, incidentDate, reason, policyReference)
 * - File evidence: EmployeeWarningAttachment rows (upload/delete while DRAFT only)
 *   are editable only via PATCH while status is DRAFT.
 * - After issue, those fields are not updated by any endpoint; workflow uses dedicated transitions only.
 * - Severity may change only via appeal decision AMEND (or at issue time from draft content).
 */

const STAFF_HIDDEN_STATUSES = [
  EmployeeWarningStatus.DRAFT,
  EmployeeWarningStatus.PENDING_HR_REVIEW,
];

function resolveEmployeeRouteId(req) {
  let raw = req.params?.id;
  if (raw === "me") {
    raw = req.user?.id;
  }
  return raw;
}

function parseIncidentDate(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseOptionalDate(value) {
  if (value == null || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function warningToDto(w) {
  return {
    id: w.id,
    userId: w.userId,
    status: w.status,
    title: w.title,
    category: w.category,
    severity: w.severity,
    incidentDate: w.incidentDate
      ? w.incidentDate.toISOString().slice(0, 10)
      : null,
    reason: w.reason,
    policyReference: w.policyReference,
    attachments: Array.isArray(w.attachments)
      ? w.attachments.map(attachmentToDto)
      : [],
    reviewNote: w.reviewNote,
    issueNote: w.issueNote,
    reviewDueDate: w.reviewDueDate
      ? w.reviewDueDate.toISOString().slice(0, 10)
      : null,
    issuedAt: w.issuedAt ? w.issuedAt.toISOString() : null,
    issuedById: w.issuedById,
    issuedByName: warningActorDisplayName(w.issuedBy),
    createdById: w.createdById,
    createdByName: warningActorDisplayName(w.createdBy),
    acknowledgedAt: w.acknowledgedAt
      ? w.acknowledgedAt.toISOString()
      : null,
    acknowledgedById: w.acknowledgedById,
    acknowledgementNote: w.acknowledgementNote,
    acknowledgementRefusedAt: w.acknowledgementRefusedAt
      ? w.acknowledgementRefusedAt.toISOString()
      : null,
    acknowledgementRefusedNote: w.acknowledgementRefusedNote,
    appealReason: w.appealReason,
    appealStatement: w.appealStatement,
    appealAttachments: w.appealAttachments ?? [],
    appealOpenedAt: w.appealOpenedAt
      ? w.appealOpenedAt.toISOString()
      : null,
    appealReviewedAt: w.appealReviewedAt
      ? w.appealReviewedAt.toISOString()
      : null,
    appealReviewedById: w.appealReviewedById,
    appealDecidedAt: w.appealDecidedAt
      ? w.appealDecidedAt.toISOString()
      : null,
    appealDecidedById: w.appealDecidedById,
    appealOutcome: w.appealOutcome,
    appealDecisionNote: w.appealDecisionNote,
    resolvedAt: w.resolvedAt ? w.resolvedAt.toISOString() : null,
    resolvedById: w.resolvedById,
    resolutionNote: w.resolutionNote,
    voidedAt: w.voidedAt ? w.voidedAt.toISOString() : null,
    voidedById: w.voidedById,
    voidNote: w.voidNote,
    escalatedAt: w.escalatedAt ? w.escalatedAt.toISOString() : null,
    escalatedById: w.escalatedById,
    escalationNote: w.escalationNote,
    finalFollowUpDueAt: w.finalFollowUpDueAt
      ? w.finalFollowUpDueAt.toISOString().slice(0, 10)
      : null,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

function isValidEnumValue(enumObj, val) {
  return Object.values(enumObj).includes(val);
}

/**
 * @param {import("@prisma/client").Prisma.EmployeeWarningWhereInput} where
 * @param {import("express").Request} req
 */
function applyWarningSearchAndSeverityFilters(where, req) {
  const search =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search) {
    const searchClause = {
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        {
          policyReference: { contains: search, mode: "insensitive" },
        },
        {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { employeeId: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ],
    };
    if (where.AND) {
      where.AND = Array.isArray(where.AND)
        ? [...where.AND, searchClause]
        : [where.AND, searchClause];
    } else {
      where.AND = [searchClause];
    }
  }

  const sevParam = req.query.severity;
  if (typeof sevParam === "string" && sevParam.trim()) {
    const parts = sevParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = parts.filter((s) =>
      isValidEnumValue(EmployeeWarningSeverity, s)
    );
    if (valid.length === 1) {
      where.severity = valid[0];
    } else if (valid.length > 1) {
      where.severity = { in: valid };
    }
  }
  return where;
}

function staffCannotViewWarning(requesterRole, status) {
  if (requesterRole !== "STAFF") return false;
  return STAFF_HIDDEN_STATUSES.includes(status);
}

export const listEmployeeWarnings = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const requesterRole = req.user?.role;

    const auth = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 401 ? "Unauthorized" : "Forbidden",
        message: auth.message,
      });
    }

    const where = {
      tenantId,
      userId: targetUserId,
    };

    if (requesterRole === "STAFF") {
      where.status = { notIn: STAFF_HIDDEN_STATUSES };
    }

    applyWarningSearchAndSeverityFilters(where, req);

    if (requesterRole !== "STAFF") {
      const singleStatus = req.query.status;
      if (
        typeof singleStatus === "string" &&
        singleStatus.trim() &&
        isValidEnumValue(EmployeeWarningStatus, singleStatus.trim())
      ) {
        where.status = singleStatus.trim();
      }
    }

    const catParam = req.query.category;
    if (
      typeof catParam === "string" &&
      catParam.trim() &&
      isValidEnumValue(EmployeeWarningCategory, catParam.trim())
    ) {
      where.category = catParam.trim();
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50)
    );
    const skip = (page - 1) * limit;

    const [total, warnings] = await Promise.all([
      prisma.employeeWarning.count({ where }),
      prisma.employeeWarning.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: warningWithAttachmentsInclude,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const payload = {
      success: true,
      message: "Warnings retrieved",
      data: warnings.map(warningToDto),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };

    const showEscalation =
      requesterRole !== "STAFF" ||
      targetUserId === req.user?.id;
    if (showEscalation && tenantId) {
      payload.escalationSummary =
        await getWarningEscalationSummaryForEmployee(tenantId, targetUserId);
    }

    return res.status(200).json(payload);
  } catch (error) {
    logger.error(`listEmployeeWarnings: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to list warnings",
    });
  }
};

/**
 * GET /api/employees/:id/warnings/escalation-summary
 * Employee-level rolling-window signals (same helper as list payload); no full list fetch.
 */
export const getEmployeeWarningEscalationSummary = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const requesterRole = req.user?.role;

    const auth = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 401 ? "Unauthorized" : "Forbidden",
        message: auth.message,
      });
    }

    const showEscalation =
      requesterRole !== "STAFF" || targetUserId === req.user?.id;
    if (!showEscalation || !tenantId) {
      return res.status(200).json({
        success: true,
        message: "Escalation summary not available for this context",
        data: null,
      });
    }

    const data = await getWarningEscalationSummaryForEmployee(
      tenantId,
      targetUserId
    );

    return res.status(200).json({
      success: true,
      message: "Escalation summary retrieved",
      data,
    });
  } catch (error) {
    logger.error(`getEmployeeWarningEscalationSummary: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to load escalation summary",
    });
  }
};

/** GET …/warnings/:warningId — single case (same dto as list items). */
export const getEmployeeWarningById = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const requesterRole = req.user?.role;
    const { warningId } = req.params;

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
      include: warningWithAttachmentsInclude,
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (staffCannotViewWarning(requesterRole, warning.status)) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Warning retrieved",
      data: warningToDto(warning),
    });
  } catch (error) {
    logger.error(`getEmployeeWarningById: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to load warning",
    });
  }
};

/** GET …/warnings/:warningId/timeline — audit-derived activity feed. */
export const getEmployeeWarningTimeline = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const requesterRole = req.user?.role;
    const { warningId } = req.params;

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (staffCannotViewWarning(requesterRole, warning.status)) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const limit = Math.min(
      200,
      Math.max(1, parseInt(String(req.query.limit || "100"), 10) || 100)
    );

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: "EmployeeWarning",
        entityId: warningId,
      },
      orderBy: { timestamp: "desc" },
      take: limit,
      include: {
        user: { select: { name: true, email: true } },
      },
    });

    const events = logs.map(mapAuditLogToTimelineEvent);

    return res.status(200).json({
      success: true,
      message: "Timeline retrieved",
      data: events,
    });
  } catch (error) {
    logger.error(`getEmployeeWarningTimeline: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to load timeline",
    });
  }
};

/** POST …/warnings/:warningId/duplicate — new draft from existing case (no attachments copied). */
export const duplicateEmployeeWarningAsDraft = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const auth = await assertCanCreateOrMutateNonIssuedWarning(
      req,
      targetUserId
    );
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 404 ? "Not Found" : "Forbidden",
        message: auth.message,
      });
    }

    const source = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
    });

    if (!source) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const copy = await prisma.employeeWarning.create({
      data: {
        tenantId,
        userId: targetUserId,
        createdById: actorId,
        status: EmployeeWarningStatus.DRAFT,
        title:
          typeof source.title === "string" && source.title.trim()
            ? `[Copy] ${source.title.trim()}`.slice(0, 450)
            : "[Copy] Case",
        category: source.category,
        severity: source.severity,
        incidentDate: source.incidentDate,
        reason: (() => {
          const r =
            typeof source.reason === "string" ? source.reason.trim() : "";
          return r || "Duplicated from prior case record.";
        })(),
        policyReference:
          typeof source.policyReference === "string" && source.policyReference.trim()
            ? source.policyReference.trim()
            : null,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.CREATE,
      "EmployeeWarning",
      copy.id,
      {
        after: {
          duplicatedFrom: source.id,
          title: copy.title,
          status: copy.status,
        },
      },
      req
    );

    return res.status(201).json({
      success: true,
      message: "Draft created from existing case",
      data: {
        ...warningToDto(copy),
        duplicatedFromWarningId: source.id,
      },
    });
  } catch (error) {
    logger.error(`duplicateEmployeeWarningAsDraft: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to duplicate case",
    });
  }
};

const MAX_DISCIPLINE_BULK_EXPORT = 500;

/**
 * Append one case folder to a zip (same contents as single-case export).
 * @param {import("archiver").Archiver} archive
 * @param {string} pathPrefix e.g. "" or "case-abc12/"
 * @param {object} warning loaded with attachments, user, issuedBy
 * @param {{ name: string | null } | null} tenant
 */
async function appendWarningPackageToZipArchive(archive, pathPrefix, warning, tenant) {
  const base =
    pathPrefix && pathPrefix.length > 0 && !pathPrefix.endsWith("/")
      ? `${pathPrefix}/`
      : pathPrefix;

  const manifest = {
    exportedAt: new Date().toISOString(),
    warning: warningToDto(warning),
    attachmentFiles: [],
  };

  manifest.letterPdfIncluded = false;
  try {
    const letterPdf = await generateWarningLetterPdfBuffer({
      tenant,
      subjectUser: warning.user,
      warning,
    });
    archive.append(Buffer.from(letterPdf), { name: `${base}warning-letter.pdf` });
    manifest.letterPdfIncluded = true;
  } catch (pdfErr) {
    logger.warn(
      `appendWarningPackageToZipArchive letter PDF skipped: ${pdfErr.message}`
    );
    manifest.letterPdfError = pdfErr.message;
  }

  for (const att of warning.attachments ?? []) {
    try {
      const buf = await getFile(att.storedName);
      const safeOriginal = String(att.originalName || "attachment").replace(
        /[/\\?%*:|"<>]/g,
        "_"
      );
      const pathInZip = `${base}attachments/${safeOriginal}`;
      archive.append(buf, { name: pathInZip });
      manifest.attachmentFiles.push({
        storedName: att.storedName,
        pathInZip,
        originalName: att.originalName,
      });
    } catch (e) {
      manifest.attachmentFiles.push({
        storedName: att.storedName,
        error: e.message,
        originalName: att.originalName,
      });
    }
  }

  archive.append(JSON.stringify(manifest, null, 2), {
    name: `${base}case-manifest.json`,
  });
}

/** GET …/warnings/:warningId/export — ZIP: manifest JSON + attachments + generated letter PDF. */
export const exportEmployeeWarningPackage = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const exportGate = assertCanExportWarningFormalPackage(req, targetUserId);
    if (!exportGate.ok) {
      return res.status(exportGate.status).json({
        success: false,
        error: "Forbidden",
        message: exportGate.message,
      });
    }

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
      include: {
        ...warningWithAttachmentsInclude,
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            email: true,
            position: { select: { title: true } },
            department: { select: { name: true } },
          },
        },
        issuedBy: {
          select: {
            name: true,
            position: { select: { title: true } },
          },
        },
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (staffCannotViewWarning(req.user?.role, warning.status)) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const tenant = tenantId
      ? await prisma.tenant.findFirst({
          where: { id: tenantId },
          select: { name: true },
        })
      : null;

    const safeSlug = String(warning.id).replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 12);
    const zipName = `case-export-${safeSlug || "record"}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=${zipName}`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      logger.error(`exportEmployeeWarningPackage archive: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: "Internal Server Error",
          message: "Failed to build export",
        });
      }
    });
    archive.pipe(res);

    await appendWarningPackageToZipArchive(archive, "", warning, tenant);

    await archive.finalize();

    if (actorId && tenantId) {
      await addLog(
        actorId,
        tenantId,
        ActionEnum.EXPORT,
        "EmployeeWarning",
        warning.id,
        { transition: "EXPORT_ZIP" },
        req
      );
    }
  } catch (error) {
    logger.error(`exportEmployeeWarningPackage: ${error.message}`, {
      stack: error.stack,
    });
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "Internal Server Error",
        message: "Failed to export case",
      });
    }
  }
};

/** GET …/warnings/:warningId/letter-pdf — single formal letter PDF (HTML render). */
export const downloadEmployeeWarningLetterPdf = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const exportGate = assertCanExportWarningFormalPackage(req, targetUserId);
    if (!exportGate.ok) {
      return res.status(exportGate.status).json({
        success: false,
        error: "Forbidden",
        message: exportGate.message,
      });
    }

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            email: true,
            position: { select: { title: true } },
            department: { select: { name: true } },
          },
        },
        issuedBy: {
          select: {
            name: true,
            position: { select: { title: true } },
          },
        },
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (staffCannotViewWarning(req.user?.role, warning.status)) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const tenant = tenantId
      ? await prisma.tenant.findFirst({
          where: { id: tenantId },
          select: { name: true },
        })
      : null;

    const pdf = await generateWarningLetterPdfBuffer({
      tenant,
      subjectUser: warning.user,
      warning,
    });

    const safeTitle = String(warning.title || "warning")
      .replace(/[/\\?%*:|"<>]/g, "_")
      .slice(0, 80);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=warning-letter-${safeTitle}.pdf`
    );

    if (actorId && tenantId) {
      await addLog(
        actorId,
        tenantId,
        ActionEnum.DOWNLOAD,
        "EmployeeWarning",
        warning.id,
        { transition: "LETTER_PDF" },
        req
      );
    }

    return res.status(200).send(Buffer.from(pdf));
  } catch (error) {
    logger.error(`downloadEmployeeWarningLetterPdf: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to generate letter PDF",
    });
  }
};

export const createEmployeeWarningDraft = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;

    const auth = await assertCanCreateOrMutateNonIssuedWarning(
      req,
      targetUserId
    );
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 404 ? "Not Found" : "Forbidden",
        message: auth.message,
      });
    }

    const {
      title,
      category,
      severity,
      incidentDate,
      reason,
      policyReference,
    } = req.body ?? {};

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "title is required",
      });
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "reason is required",
      });
    }
    if (!isValidEnumValue(EmployeeWarningCategory, category)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Invalid category",
      });
    }
    if (!isValidEnumValue(EmployeeWarningSeverity, severity)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Invalid severity",
      });
    }

    const incident = parseIncidentDate(incidentDate);
    if (!incident) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "incidentDate must be a valid date",
      });
    }

    const warning = await prisma.employeeWarning.create({
      data: {
        tenantId,
        userId: targetUserId,
        createdById: actorId,
        status: EmployeeWarningStatus.DRAFT,
        title: title.trim(),
        category,
        severity,
        incidentDate: incident,
        reason: reason.trim(),
        policyReference:
          typeof policyReference === "string" && policyReference.trim()
            ? policyReference.trim()
            : null,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.CREATE,
      "EmployeeWarning",
      warning.id,
      {
        after: {
          title: warning.title,
          status: warning.status,
          category: warning.category,
          severity: warning.severity,
        },
      },
      req
    );

    return res.status(201).json({
      success: true,
      message: "Warning draft created",
      data: warningToDto(warning),
    });
  } catch (error) {
    logger.error(`createEmployeeWarningDraft: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create warning",
    });
  }
};

export const updateEmployeeWarningDraft = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const auth = await assertCanEditDraft(req, warning, targetUserId);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 400 ? "Bad Request" : "Forbidden",
        message: auth.message,
      });
    }

    const {
      title,
      category,
      severity,
      incidentDate,
      reason,
      policyReference,
    } = req.body ?? {};

    const updateData = {};
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "title cannot be empty",
        });
      }
      updateData.title = title.trim();
    }
    if (reason !== undefined) {
      if (typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "reason cannot be empty",
        });
      }
      updateData.reason = reason.trim();
    }
    if (category !== undefined) {
      if (!isValidEnumValue(EmployeeWarningCategory, category)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Invalid category",
        });
      }
      updateData.category = category;
    }
    if (severity !== undefined) {
      if (!isValidEnumValue(EmployeeWarningSeverity, severity)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Invalid severity",
        });
      }
      updateData.severity = severity;
    }
    if (incidentDate !== undefined) {
      const incident = parseIncidentDate(incidentDate);
      if (!incident) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "incidentDate must be a valid date",
        });
      }
      updateData.incidentDate = incident;
    }
    if (policyReference !== undefined) {
      updateData.policyReference =
        typeof policyReference === "string" && policyReference.trim()
          ? policyReference.trim()
          : null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "No fields to update",
      });
    }

    const before = {
      title: warning.title,
      category: warning.category,
      severity: warning.severity,
      incidentDate: warning.incidentDate,
      reason: warning.reason,
      policyReference: warning.policyReference,
    };

    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: updateData,
      include: warningWithAttachmentsInclude,
    });

    const after = {
      title: updated.title,
      category: updated.category,
      severity: updated.severity,
      incidentDate: updated.incidentDate,
      reason: updated.reason,
      policyReference: updated.policyReference,
    };

    const changes = getChangesDiff(before, after);

    await addLog(
      actorId,
      tenantId,
      ActionEnum.UPDATE,
      "EmployeeWarning",
      warning.id,
      changes,
      req
    );

    return res.status(200).json({
      success: true,
      message: "Warning updated",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`updateEmployeeWarningDraft: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update warning",
    });
  }
};

export const submitEmployeeWarningForReview = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { reviewNote } = req.body ?? {};

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.DRAFT) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Only draft warnings can be submitted for review",
      });
    }

    const auth = await assertCanSubmitWarning(req, targetUserId, warning);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: "Forbidden",
        message: auth.message,
      });
    }

    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.PENDING_HR_REVIEW,
        reviewNote:
          typeof reviewNote === "string" && reviewNote.trim()
            ? reviewNote.trim()
            : warning.reviewNote,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "SUBMIT_FOR_REVIEW", reviewNote: updated.reviewNote },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      const actionUrl = `${frontend}/dashboard/employee/${targetUserId}`;
      const subjectName =
        (await prisma.user.findFirst({
          where: { id: targetUserId, tenantId },
          select: { name: true, employeeId: true },
        })) || {};
      const label =
        subjectName.name || subjectName.employeeId || "An employee";

      await notifyHRForWarningEvent(
        tenantId,
        "Warning pending HR review",
        `A warning for ${label} ("${updated.title}") was submitted for review.`,
        "PERFORMANCE",
        actionUrl
      );

      const hrWithEmail = await prisma.user.findMany({
        where: {
          tenantId,
          isDeleted: false,
          status: { in: EMPLOYEE_STATUSES_ACTIVE_FOR_WORK },
          role: { in: ["HR_ADMIN", "HR_STAFF"] },
        },
        select: { email: true, name: true },
      });

      for (const hr of hrWithEmail) {
        if (!hr.email) continue;
        try {
          await sendWarningSubmittedForReviewEmail({
            to: hr.email,
            recipientName: hr.name,
            employeeName: label,
            warningTitle: updated.title,
            reviewUrl: actionUrl,
          });
        } catch (emailErr) {
          logger.error(
            `submitEmployeeWarningForReview email to ${hr.email}: ${emailErr.message}`
          );
        }
      }
    } catch (notifyErr) {
      logger.error(
        `submitEmployeeWarningForReview notifications: ${notifyErr.message}`,
        { stack: notifyErr.stack }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Warning submitted for HR review",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`submitEmployeeWarningForReview: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to submit warning",
    });
  }
};

export const issueEmployeeWarning = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { issueNote, reviewDueDate } = req.body ?? {};

    const auth = assertCanIssueWarning(req);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: "Forbidden",
        message: auth.message,
      });
    }

    const viewAuth = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!viewAuth.ok) {
      return res.status(viewAuth.status).json({
        success: false,
        error: "Forbidden",
        message: viewAuth.message,
      });
    }

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.PENDING_HR_REVIEW) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Only warnings pending HR review can be issued",
      });
    }

    const due = parseOptionalDate(reviewDueDate);
    if (reviewDueDate != null && reviewDueDate !== "" && due === null) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "reviewDueDate must be a valid date",
      });
    }

    const now = new Date();
    const effectiveDue =
      due !== undefined ? due : warning.reviewDueDate;
    const isFinal = warning.severity === EmployeeWarningSeverity.FINAL;

    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.ISSUED,
        issuedAt: now,
        issuedById: actorId,
        issueNote:
          typeof issueNote === "string" && issueNote.trim()
            ? issueNote.trim()
            : null,
        reviewDueDate: due !== undefined ? due : warning.reviewDueDate,
        finalFollowUpDueAt: isFinal && effectiveDue ? effectiveDue : null,
      },
      include: {
        attachments: warningWithAttachmentsInclude.attachments,
        createdBy: warningWithAttachmentsInclude.createdBy,
        issuedBy: warningWithAttachmentsInclude.issuedBy,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            employeeId: true,
          },
        },
      },
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      {
        transition: "ISSUE",
        issuedAt: now.toISOString(),
        reviewDueDate: updated.reviewDueDate,
      },
      req
    );

    try {
      const actionUrl =
        (process.env.STAFFLEDGER_NOTIFICATION_URL || "").trim() || null;

      await createNotification(
        tenantId,
        targetUserId,
        "Formal Warning Issued",
        `A formal warning letter has been issued to you. Open the StaffLedger mobile app to review, acknowledge, and take any required action.`,
        "PERFORMANCE",
        actionUrl
      );

      const tenant = tenantId
        ? await prisma.tenant.findFirst({
            where: { id: tenantId },
            select: { name: true },
          })
        : null;
      const letterPdf = await generateWarningLetterPdfBuffer({
        tenant,
        subjectUser: updated.user,
        warning: updated,
      });
      const safeTitle = String(updated.title || "warning")
        .replace(/[/\\?%*:|"<>]/g, "_")
        .slice(0, 80);
      const letterOriginalName = `warning-letter-${safeTitle}.pdf`;
      const letterPdfBuffer = Buffer.from(letterPdf);

      if (tenantId) {
        const storedName = generateFilename(
          letterOriginalName,
          `employee-documents/${tenantId}/${targetUserId}`
        );
        const filePath = await uploadFile(
          letterPdfBuffer,
          storedName,
          "application/pdf"
        );
        const extension = parseDocumentExtension(
          letterOriginalName,
          "application/pdf"
        );
        const employeeDoc = await prisma.employeeDocument.create({
          data: {
            tenantId,
            userId: targetUserId,
            originalName: letterOriginalName,
            storedName,
            filePath,
            mimeType: "application/pdf",
            extension,
            sizeBytes: letterPdfBuffer.length,
            uploadedBy: actorId ?? undefined,
          },
        });
        await addLog(
          actorId,
          tenantId,
          "CREATE",
          "EmployeeDocument",
          employeeDoc.id,
          {
            employeeId: targetUserId,
            source: "warning_issued",
            warningId: updated.id,
            originalName: employeeDoc.originalName,
            sizeBytes: employeeDoc.sizeBytes,
          },
          req
        );
      }

      if (updated.user?.email) {
        await sendWarningIssuedEmail({
          to: updated.user.email,
          employeeName: updated.user.name || updated.user.employeeId,
          attachments: [
            {
              filename: letterOriginalName,
              content: letterPdfBuffer,
            },
          ],
        });
      }
    } catch (notifyErr) {
      logger.error(`issueEmployeeWarning notifications: ${notifyErr.message}`, {
        stack: notifyErr.stack,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Warning issued successfully",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`issueEmployeeWarning: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to issue warning",
    });
  }
};

async function loadWarningForRoutes(req, targetUserId, warningId) {
  const tenantId = getTenantId(req);
  return prisma.employeeWarning.findFirst({
    where: {
      id: warningId,
      tenantId,
      userId: targetUserId,
    },
  });
}

/** POST .../acknowledge */
export const acknowledgeEmployeeWarning = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { acknowledgementNote } = req.body ?? {};

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const act = assertCanActAsWarningEmployee(req, targetUserId);
    if (!act.ok) {
      return res.status(act.status).json({
        success: false,
        error: "Forbidden",
        message: act.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.ISSUED) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Only issued warnings can be acknowledged",
      });
    }

    const now = new Date();
    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.ACKNOWLEDGED,
        acknowledgedAt: now,
        acknowledgedById: actorId,
        acknowledgementNote:
          typeof acknowledgementNote === "string" && acknowledgementNote.trim()
            ? acknowledgementNote.trim()
            : null,
        acknowledgementRefusedAt: null,
        acknowledgementRefusedNote: null,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "ACKNOWLEDGE" },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      const actionUrl = `${frontend}/dashboard/employee/${targetUserId}`;
      if (warning.issuedById) {
        await createNotification(
          tenantId,
          warning.issuedById,
          "Warning acknowledged",
          `The employee acknowledged the warning "${updated.title}".`,
          "PERFORMANCE",
          actionUrl
        );
      }
    } catch (e) {
      logger.error(`acknowledgeEmployeeWarning notify: ${e.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Warning acknowledged",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`acknowledgeEmployeeWarning: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to acknowledge warning",
    });
  }
};

/** POST .../refuse-acknowledgement */
export const refuseEmployeeWarningAcknowledgement = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { refuseNote } = req.body ?? {};

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: "Forbidden",
        message: view.message,
      });
    }

    const act = assertCanActAsWarningEmployee(req, targetUserId);
    if (!act.ok) {
      return res.status(act.status).json({
        success: false,
        error: "Forbidden",
        message: act.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.ISSUED) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Only issued warnings can be refused for acknowledgement",
      });
    }

    const note =
      typeof refuseNote === "string" && refuseNote.trim()
        ? refuseNote.trim()
        : null;

    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        acknowledgementRefusedAt: new Date(),
        acknowledgementRefusedNote: note,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "REFUSE_ACKNOWLEDGEMENT", note },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      await notifyHRForWarningEvent(
        tenantId,
        "Employee refused warning acknowledgement",
        `An employee refused to acknowledge the warning "${updated.title}".`,
        "PERFORMANCE",
        `${frontend}/dashboard/employee/${targetUserId}`
      );
    } catch (e) {
      logger.error(`refuseEmployeeWarningAcknowledgement notify: ${e.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Refusal recorded",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`refuseEmployeeWarningAcknowledgement: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to record refusal",
    });
  }
};

/** POST .../appeal */
export const submitEmployeeWarningAppeal = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { appealReason, employeeStatement, attachments } = req.body ?? {};

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: "Forbidden",
        message: view.message,
      });
    }

    const act = assertCanActAsWarningEmployee(req, targetUserId);
    if (!act.ok) {
      return res.status(act.status).json({
        success: false,
        error: "Forbidden",
        message: act.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const appealableFrom = new Set([
      EmployeeWarningStatus.ISSUED,
      EmployeeWarningStatus.ACKNOWLEDGED,
      EmployeeWarningStatus.ESCALATED,
    ]);

    if (!appealableFrom.has(warning.status)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "This warning cannot be appealed in its current state",
      });
    }

    if (!appealReason || typeof appealReason !== "string" || !appealReason.trim()) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "appealReason is required",
      });
    }
    if (
      !employeeStatement ||
      typeof employeeStatement !== "string" ||
      !employeeStatement.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "employeeStatement is required",
      });
    }

    const now = new Date();
    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.APPEAL_OPEN,
        appealReason: appealReason.trim(),
        appealStatement: employeeStatement.trim(),
        appealAttachments: Array.isArray(attachments) ? attachments : [],
        appealOpenedAt: now,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "APPEAL_OPEN" },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      await notifyHRForWarningEvent(
        tenantId,
        "Warning appeal submitted",
        `An appeal was submitted for warning "${updated.title}".`,
        "PERFORMANCE",
        `${frontend}/dashboard/employee/${targetUserId}`
      );
    } catch (e) {
      logger.error(`submitEmployeeWarningAppeal notify: ${e.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Appeal submitted successfully",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`submitEmployeeWarningAppeal: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to submit appeal",
    });
  }
};

/** POST .../appeal/review */
export const reviewEmployeeWarningAppeal = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const hr = assertCanReviewAppeal(req);
    if (!hr.ok) {
      return res.status(hr.status).json({
        success: false,
        error: "Forbidden",
        message: hr.message,
      });
    }

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: "Forbidden",
        message: view.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.APPEAL_OPEN) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "No open appeal to move to review",
      });
    }

    const now = new Date();
    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.APPEAL_REVIEW,
        appealReviewedAt: now,
        appealReviewedById: actorId,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "APPEAL_REVIEW" },
      req
    );

    return res.status(200).json({
      success: true,
      message: "Appeal marked under review",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`reviewEmployeeWarningAppeal: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update appeal review",
    });
  }
};

/** decision: UPHOLD | AMEND | VOID (doc: AMEND) */
export const decideEmployeeWarningAppeal = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { decision, decisionNote, updatedSeverity } = req.body ?? {};

    const hr = assertCanReviewAppeal(req);
    if (!hr.ok) {
      return res.status(hr.status).json({
        success: false,
        error: "Forbidden",
        message: hr.message,
      });
    }

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: "Forbidden",
        message: view.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.APPEAL_REVIEW) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Appeal must be under HR review before a decision",
      });
    }

    let outcome = null;
    if (decision === "UPHOLD") outcome = EmployeeWarningAppealOutcome.UPHOLD;
    else if (decision === "AMEND") outcome = EmployeeWarningAppealOutcome.AMEND;
    else if (decision === "VOID") outcome = EmployeeWarningAppealOutcome.VOID;
    else {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "decision must be UPHOLD, AMEND, or VOID",
      });
    }

    const note =
      typeof decisionNote === "string" && decisionNote.trim()
        ? decisionNote.trim()
        : null;

    const now = new Date();
    let newStatus = EmployeeWarningStatus.APPEAL_UPHELD;
    let newSeverity = warning.severity;

    if (outcome === EmployeeWarningAppealOutcome.UPHOLD) {
      newStatus = EmployeeWarningStatus.APPEAL_UPHELD;
    } else if (outcome === EmployeeWarningAppealOutcome.AMEND) {
      newStatus = EmployeeWarningStatus.APPEAL_AMENDED;
      if (updatedSeverity == null || !Object.values(EmployeeWarningSeverity).includes(updatedSeverity)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "updatedSeverity is required for AMEND",
        });
      }
      newSeverity = updatedSeverity;
    } else {
      newStatus = EmployeeWarningStatus.APPEAL_VOIDED;
    }

    const appealUpdateData = {
      status: newStatus,
      severity: newSeverity,
      appealDecidedAt: now,
      appealDecidedById: actorId,
      appealOutcome: outcome,
      appealDecisionNote: note,
    };

    if (outcome === EmployeeWarningAppealOutcome.AMEND) {
      appealUpdateData.finalFollowUpDueAt =
        newSeverity === EmployeeWarningSeverity.FINAL
          ? warning.reviewDueDate ?? warning.finalFollowUpDueAt
          : null;
    }

    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: appealUpdateData,
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "APPEAL_DECISION", decision: outcome },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      await createNotification(
        tenantId,
        targetUserId,
        "Appeal decision recorded",
        `Your appeal for "${updated.title}" was ${String(outcome).toLowerCase()}.`,
        "PERFORMANCE",
        `${frontend}/dashboard/employee/${targetUserId}`
      );
    } catch (e) {
      logger.error(`decideEmployeeWarningAppeal notify: ${e.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Appeal decision recorded",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`decideEmployeeWarningAppeal: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to record appeal decision",
    });
  }
};

export const resolveEmployeeWarning = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { resolutionNote } = req.body ?? {};

    const hr = assertCanResolveVoidEscalate(req);
    if (!hr.ok) {
      return res.status(hr.status).json({
        success: false,
        error: "Forbidden",
        message: hr.message,
      });
    }

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: "Forbidden",
        message: view.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const resolvable = new Set([
      EmployeeWarningStatus.ISSUED,
      EmployeeWarningStatus.ACKNOWLEDGED,
      EmployeeWarningStatus.APPEAL_UPHELD,
      EmployeeWarningStatus.APPEAL_AMENDED,
      EmployeeWarningStatus.ESCALATED,
    ]);

    if (!resolvable.has(warning.status)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Warning cannot be resolved in its current state",
      });
    }

    const note =
      typeof resolutionNote === "string" && resolutionNote.trim()
        ? resolutionNote.trim()
        : null;

    const now = new Date();
    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.RESOLVED,
        resolvedAt: now,
        resolvedById: actorId,
        resolutionNote: note,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "RESOLVE" },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      await createNotification(
        tenantId,
        targetUserId,
        "Warning resolved",
        `The warning "${updated.title}" has been marked resolved.`,
        "PERFORMANCE",
        `${frontend}/dashboard/employee/${targetUserId}`
      );
    } catch (e) {
      logger.error(`resolveEmployeeWarning notify: ${e.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Warning resolved",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`resolveEmployeeWarning: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to resolve warning",
    });
  }
};

export const voidEmployeeWarning = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { voidNote } = req.body ?? {};

    const hr = assertCanResolveVoidEscalate(req);
    if (!hr.ok) {
      return res.status(hr.status).json({
        success: false,
        error: "Forbidden",
        message: hr.message,
      });
    }

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: "Forbidden",
        message: view.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status === EmployeeWarningStatus.VOIDED) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Warning is already voided",
      });
    }

    if (
      warning.status === EmployeeWarningStatus.DRAFT ||
      warning.status === EmployeeWarningStatus.PENDING_HR_REVIEW
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Void applies to warnings that have left the draft pipeline",
      });
    }

    const note =
      typeof voidNote === "string" && voidNote.trim() ? voidNote.trim() : null;

    const now = new Date();
    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.VOIDED,
        voidedAt: now,
        voidedById: actorId,
        voidNote: note,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "VOID" },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      await createNotification(
        tenantId,
        targetUserId,
        "Warning voided",
        `The warning "${updated.title}" has been voided.`,
        "PERFORMANCE",
        `${frontend}/dashboard/employee/${targetUserId}`
      );
    } catch (e) {
      logger.error(`voidEmployeeWarning notify: ${e.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Warning voided",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`voidEmployeeWarning: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to void warning",
    });
  }
};

export const escalateEmployeeWarning = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { escalationNote } = req.body ?? {};

    const hr = assertCanResolveVoidEscalate(req);
    if (!hr.ok) {
      return res.status(hr.status).json({
        success: false,
        error: "Forbidden",
        message: hr.message,
      });
    }

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: "Forbidden",
        message: view.message,
      });
    }

    const warning = await loadWarningForRoutes(req, targetUserId, warningId);
    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const escalatable = new Set([
      EmployeeWarningStatus.ISSUED,
      EmployeeWarningStatus.ACKNOWLEDGED,
      EmployeeWarningStatus.APPEAL_UPHELD,
      EmployeeWarningStatus.APPEAL_AMENDED,
    ]);

    if (!escalatable.has(warning.status)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Warning cannot be escalated in its current state",
      });
    }

    const note =
      typeof escalationNote === "string" && escalationNote.trim()
        ? escalationNote.trim()
        : null;

    const now = new Date();
    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.ESCALATED,
        escalatedAt: now,
        escalatedById: actorId,
        escalationNote: note,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "ESCALATE" },
      req
    );

    try {
      const frontend = process.env.CLIENT_URL || "http://localhost:3000";
      await notifyHRForWarningEvent(
        tenantId,
        "Warning escalated",
        `Warning "${updated.title}" for employee was marked escalated.`,
        "PERFORMANCE",
        `${frontend}/dashboard/employee/${targetUserId}`
      );
      await createNotification(
        tenantId,
        targetUserId,
        "Warning escalated",
        `Your warning "${updated.title}" has been escalated for further review.`,
        "PERFORMANCE",
        `${frontend}/dashboard/employee/${targetUserId}`
      );
    } catch (e) {
      logger.error(`escalateEmployeeWarning notify: ${e.message}`);
    }

    return res.status(200).json({
      success: true,
      message: "Warning escalated",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`escalateEmployeeWarning: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to escalate warning",
    });
  }
};

/** POST .../warnings/:warningId/attachments — multipart field "documents" (same as employee docs) */
export const uploadEmployeeWarningAttachments = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const auth = await assertCanEditDraft(req, warning, targetUserId);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 400 ? "Bad Request" : "Forbidden",
        message: auth.message,
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
        message: "No files uploaded",
      });
    }

    const uploaded = [];
    for (const file of files) {
      const storedName = generateFilename(
        file.originalname,
        `employee-warning-attachments/${tenantId}/${warningId}`
      );
      const filePath = await uploadFile(file.buffer, storedName, file.mimetype);
      const extension = parseDocumentExtension(file.originalname, file.mimetype);

      const row = await prisma.employeeWarningAttachment.create({
        data: {
          tenantId,
          employeeWarningId: warningId,
          originalName: file.originalname,
          storedName,
          filePath,
          mimeType: file.mimetype,
          extension,
          sizeBytes: file.size,
          uploadedBy: actorId,
        },
      });
      uploaded.push(row);

      await addLog(
        actorId,
        tenantId,
        ActionEnum.CREATE,
        "EmployeeWarningAttachment",
        row.id,
        {
          after: {
            warningId,
            originalName: row.originalName,
            sizeBytes: row.sizeBytes,
          },
        },
        req
      );
    }

    const fresh = await prisma.employeeWarning.findFirst({
      where: { id: warningId, tenantId, userId: targetUserId },
      include: warningWithAttachmentsInclude,
    });

    return res.status(201).json({
      success: true,
      message:
        uploaded.length === 1
          ? "Attachment uploaded"
          : `${uploaded.length} attachments uploaded`,
      data: uploaded.map(attachmentToDto),
      warning: fresh ? warningToDto(fresh) : null,
    });
  } catch (error) {
    logger.error(`uploadEmployeeWarningAttachments: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to upload attachments",
    });
  }
};

export const downloadEmployeeWarningAttachment = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const { warningId, attachmentId } = req.params;

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const attachment = await prisma.employeeWarningAttachment.findFirst({
      where: {
        id: attachmentId,
        employeeWarningId: warningId,
        tenantId,
        employeeWarning: { userId: targetUserId },
      },
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Attachment not found",
      });
    }

    const fileBuffer = await getFile(attachment.storedName);
    res.setHeader(
      "Content-Type",
      attachment.mimeType || "application/octet-stream"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${String(attachment.originalName).replace(/"/g, "")}"`
    );
    return res.status(200).send(fileBuffer);
  } catch (error) {
    logger.error(`downloadEmployeeWarningAttachment: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to download attachment",
    });
  }
};

export const deleteEmployeeWarningAttachment = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId, attachmentId } = req.params;

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const auth = await assertCanEditDraft(req, warning, targetUserId);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 400 ? "Bad Request" : "Forbidden",
        message: auth.message,
      });
    }

    const attachment = await prisma.employeeWarningAttachment.findFirst({
      where: {
        id: attachmentId,
        employeeWarningId: warningId,
        tenantId,
      },
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Attachment not found",
      });
    }

    await prisma.employeeWarningAttachment.delete({
      where: { id: attachment.id },
    });

    try {
      const storageKey =
        extractFilenameFromUrl(attachment.filePath) || attachment.storedName;
      if (storageKey) await deleteFile(storageKey);
    } catch (deleteErr) {
      logger.warn(
        `Could not delete warning attachment file: ${deleteErr.message}`
      );
    }

    await addLog(
      actorId,
      tenantId,
      ActionEnum.DELETE,
      "EmployeeWarningAttachment",
      attachmentId,
      { before: { originalName: attachment.originalName } },
      req
    );

    const fresh = await prisma.employeeWarning.findFirst({
      where: { id: warningId, tenantId, userId: targetUserId },
      include: warningWithAttachmentsInclude,
    });

    return res.status(200).json({
      success: true,
      message: "Attachment removed",
      data: fresh ? warningToDto(fresh) : null,
    });
  } catch (error) {
    logger.error(`deleteEmployeeWarningAttachment: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to delete attachment",
    });
  }
};

/** DELETE .../warnings/:warningId — draft only; removes attachments from storage */
export const deleteEmployeeWarningDraft = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
      include: warningWithAttachmentsInclude,
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    const auth = await assertCanEditDraft(req, warning, targetUserId);
    if (!auth.ok) {
      return res.status(auth.status).json({
        success: false,
        error: auth.status === 400 ? "Bad Request" : "Forbidden",
        message: auth.message,
      });
    }

    if (warning.status !== EmployeeWarningStatus.DRAFT) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Only draft warnings can be deleted",
      });
    }

    for (const att of warning.attachments ?? []) {
      try {
        const storageKey =
          extractFilenameFromUrl(att.filePath) || att.storedName;
        if (storageKey) await deleteFile(storageKey);
      } catch (e) {
        logger.warn(`deleteEmployeeWarningDraft file cleanup: ${e.message}`);
      }
    }

    await prisma.employeeWarning.delete({
      where: { id: warning.id },
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.DELETE,
      "EmployeeWarning",
      warningId,
      { before: { title: warning.title, status: warning.status } },
      req
    );

    return res.status(200).json({
      success: true,
      message: "Warning draft deleted",
      data: { id: warningId },
    });
  } catch (error) {
    logger.error(`deleteEmployeeWarningDraft: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to delete warning",
    });
  }
};

/**
 * POST .../warnings/:warningId/return-to-draft
 * HR returns a case from PENDING_HR_REVIEW to DRAFT so the creator can revise.
 */
export const returnEmployeeWarningToDraft = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;
    const { changesRequestedNote } = req.body ?? {};

    const gate = assertCanIssueWarning(req);
    if (!gate.ok) {
      return res.status(gate.status).json({
        success: false,
        error: "Forbidden",
        message: gate.message,
      });
    }

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.PENDING_HR_REVIEW) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Only warnings pending HR review can be returned to draft",
      });
    }

    const note =
      typeof changesRequestedNote === "string" && changesRequestedNote.trim()
        ? changesRequestedNote.trim()
        : null;

    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: {
        status: EmployeeWarningStatus.DRAFT,
        reviewNote: note ?? warning.reviewNote,
      },
      include: warningWithAttachmentsInclude,
    });

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      {
        transition: "RETURN_TO_DRAFT",
        changesRequestedNote: note,
      },
      req
    );

    return res.status(200).json({
      success: true,
      message: "Warning returned to draft for revision",
      data: warningToDto(updated),
    });
  } catch (error) {
    logger.error(`returnEmployeeWarningToDraft: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to return warning to draft",
    });
  }
};

/**
 * POST .../warnings/:warningId/resend-issued-notification
 * Re-sends in-app + email issuance notification (ISSUED only).
 */
export const resendWarningIssuedNotification = async (req, res) => {
  try {
    const targetUserId = resolveEmployeeRouteId(req);
    const tenantId = getTenantId(req);
    const actorId = req.user?.id;
    const { warningId } = req.params;

    const gate = assertCanIssueWarning(req);
    if (!gate.ok) {
      return res.status(gate.status).json({
        success: false,
        error: "Forbidden",
        message: gate.message,
      });
    }

    const view = await assertCanViewEmployeeWarnings(req, targetUserId);
    if (!view.ok) {
      return res.status(view.status).json({
        success: false,
        error: view.status === 404 ? "Not Found" : "Forbidden",
        message: view.message,
      });
    }

    const warning = await prisma.employeeWarning.findFirst({
      where: {
        id: warningId,
        tenantId,
        userId: targetUserId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            employeeId: true,
          },
        },
      },
    });

    if (!warning) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Warning not found",
      });
    }

    if (warning.status !== EmployeeWarningStatus.ISSUED) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Resend is only available for issued warnings",
      });
    }

    try {
      const actionUrl =
        (process.env.STAFFLEDGER_NOTIFICATION_URL || "").trim() || null;

      await createNotification(
        tenantId,
        targetUserId,
        "Formal Warning Issued",
        `A formal warning letter has been issued to you. Open the StaffLedger mobile app to review, acknowledge, and take any required action.`,
        "PERFORMANCE",
        actionUrl
      );

      if (warning.user?.email) {
        const tenant = tenantId
          ? await prisma.tenant.findFirst({
              where: { id: tenantId },
              select: { name: true },
            })
          : null;
        const letterPdf = await generateWarningLetterPdfBuffer({
          tenant,
          subjectUser: warning.user,
          warning,
        });
        const safeTitle = String(warning.title || "warning")
          .replace(/[/\\?%*:|"<>]/g, "_")
          .slice(0, 80);
        await sendWarningIssuedEmail({
          to: warning.user.email,
          employeeName: warning.user.name || warning.user.employeeId,
          attachments: [
            {
              filename: `warning-letter-${safeTitle}.pdf`,
              content: Buffer.from(letterPdf),
            },
          ],
        });
      }
    } catch (notifyErr) {
      logger.error(
        `resendWarningIssuedNotification: ${notifyErr.message}`,
        { stack: notifyErr.stack }
      );
      return res.status(502).json({
        success: false,
        error: "Bad Gateway",
        message: "Could not send notification; try again later",
      });
    }

    await addLog(
      actorId,
      tenantId,
      ActionEnum.OTHER,
      "EmployeeWarning",
      warning.id,
      { transition: "RESEND_ISSUED_NOTIFICATION" },
      req
    );

    return res.status(200).json({
      success: true,
      message: "Issuance notification resent",
      data: { id: warning.id },
    });
  } catch (error) {
    logger.error(`resendWarningIssuedNotification: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to resend notification",
    });
  }
};

function warningToDashboardRow(w, escalationSummary) {
  const dto = warningToDto(w);
  const u = w.user;
  return {
    ...dto,
    subject: u
      ? {
          id: u.id,
          name: u.name,
          email: u.email,
          employeeId: u.employeeId,
          departmentId: u.departmentId,
          departmentName: u.department?.name ?? null,
        }
      : null,
    escalationSummary,
  };
}

/**
 * GET /api/employees/warnings/dashboard
 * Tenant-scoped warning list for discipline table (HR: full tenant; dept admin: managed depts).
 */
export const listDisciplineWarningsDashboard = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const requesterRole = req.user?.role;
    const requesterId = req.user?.id;

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "User not authenticated",
      });
    }
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant context required",
      });
    }

    if (
      requesterRole !== "HR_ADMIN" &&
      requesterRole !== "HR_STAFF" &&
      requesterRole !== "DEPARTMENT_ADMIN" &&
      requesterRole !== "SUPER_ADMIN"
    ) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Insufficient permissions",
      });
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "50"), 10) || 50)
    );
    const skip = (page - 1) * limit;

    const where = { tenantId };

    const statusParam = req.query.status;
    if (typeof statusParam === "string" && statusParam.trim()) {
      const parts = statusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const valid = parts.filter((s) =>
        isValidEnumValue(EmployeeWarningStatus, s)
      );
      if (valid.length === 1) {
        where.status = valid[0];
      } else if (valid.length > 1) {
        where.status = { in: valid };
      }
    }

    if (requesterRole === "DEPARTMENT_ADMIN") {
      const managedDeptIds = await getManagedDepartmentIds(
        tenantId,
        requesterId
      );
      if (managedDeptIds.length === 0) {
        return res.status(200).json({
          success: true,
          message: "Warnings retrieved",
          data: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        });
      }
      const scopedUsers = await prisma.user.findMany({
        where: {
          tenantId,
          isDeleted: false,
          departmentId: { in: managedDeptIds },
        },
        select: { id: true },
      });
      where.userId = { in: scopedUsers.map((u) => u.id) };
    }

    applyWarningSearchAndSeverityFilters(where, req);

    const catParam = req.query.category;
    if (
      typeof catParam === "string" &&
      catParam.trim() &&
      isValidEnumValue(EmployeeWarningCategory, catParam.trim())
    ) {
      where.category = catParam.trim();
    }

    const sortByRaw =
      typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "";
    const sortOrderRaw =
      typeof req.query.sortOrder === "string"
        ? req.query.sortOrder.trim().toLowerCase()
        : "";
    const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";

    let orderBy;
    if (sortByRaw === "employee") {
      orderBy = { user: { name: sortOrder } };
    } else if (sortByRaw === "severity") {
      orderBy = { severity: sortOrder };
    } else {
      orderBy = { updatedAt: sortOrder };
    }

    const [total, warnings] = await Promise.all([
      prisma.employeeWarning.count({ where }),
      prisma.employeeWarning.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          ...warningWithAttachmentsInclude,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              departmentId: true,
              department: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const uniqueUserIds = [...new Set(warnings.map((w) => w.userId))];
    const escalationByUserId = Object.fromEntries(
      await Promise.all(
        uniqueUserIds.map(async (uid) => {
          const summary = await getWarningEscalationSummaryForEmployee(
            tenantId,
            uid
          );
          return [uid, summary];
        })
      )
    );

    return res.status(200).json({
      success: true,
      message: "Warnings retrieved",
      data: warnings.map((w) =>
        warningToDashboardRow(w, escalationByUserId[w.userId])
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(`listDisciplineWarningsDashboard: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to list warnings",
    });
  }
};

/**
 * Same filters/order as GET /employees/warnings/dashboard (no pagination).
 * Optional `ids` (comma-separated warning ids) restricts to those rows within scope.
 * @returns {{ where: object, orderBy: object } | { empty: true }}
 */
async function resolveDisciplineDashboardWhereOrder(req) {
  const tenantId = getTenantId(req);
  const requesterRole = req.user?.role;
  const requesterId = req.user?.id;

  const where = { tenantId };

  const statusParam = req.query.status;
  if (typeof statusParam === "string" && statusParam.trim()) {
    const parts = statusParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const valid = parts.filter((s) =>
      isValidEnumValue(EmployeeWarningStatus, s)
    );
    if (valid.length === 1) {
      where.status = valid[0];
    } else if (valid.length > 1) {
      where.status = { in: valid };
    }
  }

  if (requesterRole === "DEPARTMENT_ADMIN") {
    const managedDeptIds = await getManagedDepartmentIds(
      tenantId,
      requesterId
    );
    if (managedDeptIds.length === 0) {
      return { empty: true };
    }
    const scopedUsers = await prisma.user.findMany({
      where: {
        tenantId,
        isDeleted: false,
        departmentId: { in: managedDeptIds },
      },
      select: { id: true },
    });
    where.userId = { in: scopedUsers.map((u) => u.id) };
  }

  applyWarningSearchAndSeverityFilters(where, req);

  const catParam = req.query.category;
  if (
    typeof catParam === "string" &&
    catParam.trim() &&
    isValidEnumValue(EmployeeWarningCategory, catParam.trim())
  ) {
    where.category = catParam.trim();
  }

  const idsParam = req.query.ids;
  if (typeof idsParam === "string" && idsParam.trim()) {
    const parts = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length) {
      where.id = { in: parts };
    }
  }

  const sortByRaw =
    typeof req.query.sortBy === "string" ? req.query.sortBy.trim() : "";
  const sortOrderRaw =
    typeof req.query.sortOrder === "string"
      ? req.query.sortOrder.trim().toLowerCase()
      : "";
  const sortOrder = sortOrderRaw === "asc" ? "asc" : "desc";

  let orderBy;
  if (sortByRaw === "employee") {
    orderBy = { user: { name: sortOrder } };
  } else if (sortByRaw === "severity") {
    orderBy = { severity: sortOrder };
  } else {
    orderBy = { updatedAt: sortOrder };
  }

  return { where, orderBy };
}

/**
 * GET /api/employees/warnings/dashboard/export — one ZIP with a folder per case (same filters as dashboard list).
 */
export const exportDisciplineWarningsDashboardBulk = async (req, res) => {
  try {
    const tenantId = getTenantId(req);
    const requesterRole = req.user?.role;
    const requesterId = req.user?.id;

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "User not authenticated",
      });
    }
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant context required",
      });
    }

    if (requesterRole !== "HR_ADMIN" && requesterRole !== "SUPER_ADMIN") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only HR administrators can export discipline cases in bulk",
      });
    }

    const ctx = await resolveDisciplineDashboardWhereOrder(req);
    if (ctx.empty) {
      return res.status(400).json({
        success: false,
        message:
          "No cases match your filters (no departments in scope for department admin).",
      });
    }

    const { where, orderBy } = ctx;

    const total = await prisma.employeeWarning.count({ where });
    if (total === 0) {
      return res.status(404).json({
        success: false,
        message: "No cases to export for the current filters.",
      });
    }

    if (total > MAX_DISCIPLINE_BULK_EXPORT) {
      return res.status(400).json({
        success: false,
        message: `Too many cases (${total}). Narrow filters or export at most ${MAX_DISCIPLINE_BULK_EXPORT} cases.`,
      });
    }

    const warnings = await prisma.employeeWarning.findMany({
      where,
      orderBy,
      take: MAX_DISCIPLINE_BULK_EXPORT,
      include: {
        ...warningWithAttachmentsInclude,
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            email: true,
            position: { select: { title: true } },
            department: { select: { name: true } },
          },
        },
        issuedBy: {
          select: {
            name: true,
            position: { select: { title: true } },
          },
        },
      },
    });

    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true },
    });

    const zipName = `discipline-cases-${new Date().toISOString().slice(0, 10)}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      logger.error(`exportDisciplineWarningsDashboardBulk archive: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Failed to build export",
        });
      }
    });
    archive.pipe(res);

    for (const warning of warnings) {
      const safeSlug = String(warning.id).replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 12);
      const folder = `case-${safeSlug || "record"}/`;
      await appendWarningPackageToZipArchive(archive, folder, warning, tenant);
    }

    archive.append(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          caseCount: warnings.length,
          query: {
            search: req.query.search ?? "",
            status: req.query.status ?? "",
            severity: req.query.severity ?? "",
            category: req.query.category ?? "",
            sortBy: req.query.sortBy ?? "",
            sortOrder: req.query.sortOrder ?? "",
            ids: req.query.ids ?? "",
          },
        },
        null,
        2
      ),
      { name: "export-manifest.json" }
    );

    await archive.finalize();

    const actorId = req.user?.id;
    if (actorId && tenantId && warnings.length) {
      await addLog(
        actorId,
        tenantId,
        ActionEnum.EXPORT,
        "EmployeeWarning",
        warnings[0].id,
        { transition: "BULK_EXPORT_ZIP", caseCount: warnings.length },
        req
      );
    }
  } catch (error) {
    logger.error(`exportDisciplineWarningsDashboardBulk: ${error.message}`, {
      stack: error.stack,
    });
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Failed to export cases",
      });
    }
  }
};
