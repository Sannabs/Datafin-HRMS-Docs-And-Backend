import {
  EmployeeWarningCategory,
  EmployeeWarningSeverity,
  EmployeeWarningStatus,
  ActionEnum,
} from "@prisma/client";
import prisma from "../config/prisma.config.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import logger from "../utils/logger.js";
import {
  assertCanViewEmployeeWarnings,
  assertCanCreateOrMutateNonIssuedWarning,
  assertCanSubmitWarning,
  assertCanIssueWarning,
  assertCanEditDraft,
  getTenantId,
} from "../utils/employee-warning-access.js";
import {
  createNotification,
  notifyHRForWarningEvent,
} from "../services/notification.service.js";
import { sendWarningIssuedEmail } from "../views/sendWarningIssuedEmail.js";

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
    attachments: w.attachments ?? [],
    reviewNote: w.reviewNote,
    issueNote: w.issueNote,
    reviewDueDate: w.reviewDueDate
      ? w.reviewDueDate.toISOString().slice(0, 10)
      : null,
    issuedAt: w.issuedAt ? w.issuedAt.toISOString() : null,
    issuedById: w.issuedById,
    createdById: w.createdById,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

function isValidEnumValue(enumObj, val) {
  return Object.values(enumObj).includes(val);
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

    const warnings = await prisma.employeeWarning.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      message: "Warnings retrieved",
      data: warnings.map(warningToDto),
    });
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
      attachments,
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
        attachments:
          attachments !== undefined
            ? Array.isArray(attachments)
              ? attachments
              : null
            : undefined,
      },
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
      attachments,
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
    if (attachments !== undefined) {
      updateData.attachments = Array.isArray(attachments) ? attachments : null;
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
      attachments: warning.attachments,
    };

    const updated = await prisma.employeeWarning.update({
      where: { id: warning.id },
      data: updateData,
    });

    const after = {
      title: updated.title,
      category: updated.category,
      severity: updated.severity,
      incidentDate: updated.incidentDate,
      reason: updated.reason,
      policyReference: updated.policyReference,
      attachments: updated.attachments,
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
      const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
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
      const frontend = process.env.FRONTEND_URL || "http://localhost:3000";
      const actionUrl = `${frontend}/dashboard/employee/${targetUserId}`;

      await createNotification(
        tenantId,
        targetUserId,
        "Formal warning issued",
        `A formal warning "${updated.title}" has been issued. Please review your profile for details.`,
        "PERFORMANCE",
        actionUrl
      );

      if (updated.user?.email) {
        await sendWarningIssuedEmail({
          to: updated.user.email,
          employeeName: updated.user.name || updated.user.employeeId,
          warningTitle: updated.title,
          severity: updated.severity,
          detailUrl: actionUrl,
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
