import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

const VALID_TYPES = [
  "clock_in",
  "clock_out",
  "approved_leave",
  "rejected_leave",
  "leave_submitted",
  "payroll",
  "attendance",
  "other",
];

export const createRecentActivity = async (
  tenantId,
  userId,
  type,
  description,
  icon,
  color
) => {
  if (!tenantId || !userId) {
    throw new Error("tenantId and userId are required");
  }
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`Invalid activity type. Valid: ${VALID_TYPES.join(", ")}`);
  }
  if (!description || typeof description !== "string" || !description.trim()) {
    throw new Error("description is required");
  }

  const activity = await prisma.recentActivity.create({
    data: {
      tenantId,
      userId,
      type,
      description: description.trim(),
      icon: icon || "info",
      color: color || "#2F9B65",
    },
  });
  logger.info(`RecentActivity created: ${activity.id} (${type}) for user ${userId}`);
  return activity;
};
