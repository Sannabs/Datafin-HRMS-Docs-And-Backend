/**
 * Activity util: records recent activities for the home feed.
 * Use this from employee self-service endpoints (clock in/out, leave, etc.).
 */
import { createRecentActivity } from "../services/recent-activity.service.js";
import logger from "./logger.js";

const ACTIVITY_DEFAULTS = {
  clock_in: { icon: "log-in", color: "#22C55E" },
  clock_out: { icon: "log-out", color: "#EF4444" },
  approved_leave: { icon: "check-circle", color: "#22C55E" },
  rejected_leave: { icon: "x-circle", color: "#EF4444" },
  leave_submitted: { icon: "send", color: "#3B82F6" },
  payroll: { icon: "dollar-sign", color: "#8B5CF6" },
  attendance: { icon: "clipboard", color: "#F59E0B" },
  other: { icon: "info", color: "#6B7280" },
};

/**
 * Record a recent activity for the user's home feed.
 * Safe to call from controllers; logs errors and does not throw so it won't fail the main request.
 *
 * @param {string} tenantId
 * @param {string} userId - User who performed the action (activity appears on their feed)
 * @param {string} type - One of: clock_in, clock_out, approved_leave, rejected_leave, leave_submitted, payroll, attendance, other
 * @param {string} description - Human-readable description (e.g. "Clocked in at 8:02 AM")
 */
export const recordRecentActivity = async (tenantId, userId, type, description) => {
  if (!tenantId || !userId || !description?.trim()) return;
  const defaults = ACTIVITY_DEFAULTS[type];
  if (!defaults) {
    logger.warn(`Activity util: unknown type "${type}", using "other"`);
  }
  const { icon, color } = defaults || ACTIVITY_DEFAULTS.other;
  try {
    await createRecentActivity(tenantId, userId, type, description.trim(), icon, color);
  } catch (err) {
    logger.error(`Failed to record recent activity (${type}): ${err.message}`, {
      tenantId,
      userId,
    });
  }
};
