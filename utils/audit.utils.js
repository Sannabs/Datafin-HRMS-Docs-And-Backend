import logger from "./logger.js";
import prisma from "../config/prisma.config.js";
import { ActionEnum } from "@prisma/client";

/** Single source of truth: derived from ActionEnum in schema.prisma */
const VALID_ACTIONS = Object.values(ActionEnum);

export const addLog = async (
  userId,
  tenantId,
  action,
  entityType,
  entityId,
  changes,
  req
) => {
  try {
    if (!userId || !tenantId || !action || !entityType || !entityId) {
      const missing = [];
      if (!userId) missing.push("userId");
      if (!tenantId) missing.push("tenantId");
      if (!action) missing.push("action");
      if (!entityType) missing.push("entityType");
      if (!entityId) missing.push("entityId");

      logger.error(
        `Audit log validation failed - missing fields: ${missing.join(", ")}`
      );
      return null;
    }

    if (!VALID_ACTIONS.includes(action.toUpperCase())) {
      logger.error(
        `Invalid action type: ${action}. Must be one of: ${VALID_ACTIONS.join(
          ", "
        )}`
      );
      return null;
    }

    let ipAddress = null;
    let userAgent = null;

    if (req) {
      ipAddress =
        req.ip ||
        req.headers["x-forwarded-for"].split(",")[0] ||
        req.connection?.remoteAddress ||
        null;
      userAgent = req.headers["user-agent"] || null;
    }

    const auditLog = await prisma.auditLog.create({
      data: {
        userId,
        tenantId,
        action: action.toUpperCase(),
        entityType,
        entityId,
        changes,
        ipAddress,
        userAgent,
      },
    });

    logger.info(
      `Audit log added successfully for user ${userId} on entity ${entityType} with id ${entityId}`
    );

    return auditLog;
  } catch (error) {
    logger.error(`Error adding audit log: ${error.message}`, {
      error: error.stack,
      userId,
      tenantId,
      action,
      entityType,
      entityId,
    });
    // Return null instead of throwing to prevent audit failures from breaking main operations
    return null;
  }
};

export const getChangesDiff = (oldData, newData) => {
  if (!oldData || !newData) return null;

  const changes = {};

  // Get all unique keys from both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  allKeys.forEach((key) => {
    // Skip sensitive fields and metadata
    const sensitiveFields = ["password", "createdAt", "updatedAt", "deletedAt"];
    if (sensitiveFields.includes(key)) return;

    const oldValue = oldData[key];
    const newValue = newData[key];

    // Only include fields that actually changed
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[key] = {
        before: oldValue,
        after: newValue,
      };
    }
  });

  return Object.keys(changes).length > 0 ? changes : null;
};
