import logger from "../utils/logger.js";
import {
    listOvertimeRowsForPayPeriod,
    setBulkOvertimeApprovalStatus,
    setOvertimeApprovalStatus,
} from "../services/overtime-approval.service.js";

/**
 * GET /api/payroll/overtime-approvals?payPeriodId=
 */
export const listOvertimeApprovals = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const payPeriodId = req.query.payPeriodId;
        if (!payPeriodId || typeof payPeriodId !== "string") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "payPeriodId query parameter is required",
            });
        }

        const data = await listOvertimeRowsForPayPeriod(tenantId, payPeriodId);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        logger.error(`listOvertimeApprovals: ${error.message}`, { stack: error.stack });
        const status =
            error.message === "Pay period not found"
                ? 404
                : error.message === "Overtime is disabled for this company"
                  ? 409
                  : 500;
        return res.status(status).json({
            success: false,
            error:
                status === 404
                    ? "Not Found"
                    : status === 409
                      ? "Conflict"
                      : "Internal Server Error",
            message: error.message || "Failed to load overtime approvals",
        });
    }
};

/**
 * POST /api/payroll/overtime-approvals/decision
 * Body: { payPeriodId, userId, status: "APPROVED" | "REJECTED", notes? }
 */
export const postOvertimeApprovalDecision = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorUserId = req.user.id;
        const { payPeriodId, userId, status, notes } = req.body || {};

        if (!payPeriodId || !userId || !status) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "payPeriodId, userId, and status are required",
            });
        }

        const row = await setOvertimeApprovalStatus(
            tenantId,
            payPeriodId,
            userId,
            status,
            actorUserId,
            notes
        );

        return res.status(200).json({
            success: true,
            data: row,
            message: status === "APPROVED" ? "Overtime approved" : "Overtime rejected",
        });
    } catch (error) {
        logger.error(`postOvertimeApprovalDecision: ${error.message}`, { stack: error.stack });
        const msg = error.message || "Failed to update approval";
        if (msg.includes("closed")) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: msg,
            });
        }
        if (msg.includes("Overtime is disabled")) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: msg,
            });
        }
        const status =
            msg.includes("not found") || msg.includes("No overtime")
                ? 400
                : 500;
        return res.status(status).json({
            success: false,
            error: status === 400 ? "Bad Request" : "Internal Server Error",
            message: msg,
        });
    }
};

/**
 * POST /api/payroll/overtime-approvals/bulk-decision
 * Body: { payPeriodId, userIds: string[], status: "APPROVED" | "REJECTED", notes? }
 */
export const postBulkOvertimeApprovalDecision = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorUserId = req.user.id;
        const { payPeriodId, userIds, status, notes } = req.body || {};

        if (!payPeriodId || !Array.isArray(userIds) || userIds.length === 0 || !status) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "payPeriodId, userIds (non-empty array), and status are required",
            });
        }

        const summary = await setBulkOvertimeApprovalStatus(
            tenantId,
            payPeriodId,
            userIds,
            status,
            actorUserId,
            notes
        );

        return res.status(200).json({
            success: true,
            data: summary,
            message:
                status === "APPROVED"
                    ? "Bulk overtime approval completed"
                    : "Bulk overtime rejection completed",
        });
    } catch (error) {
        logger.error(`postBulkOvertimeApprovalDecision: ${error.message}`, { stack: error.stack });
        const msg = error.message || "Failed to update overtime approvals";
        if (msg.includes("closed")) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: msg,
            });
        }
        if (msg.includes("Overtime is disabled")) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: msg,
            });
        }
        const status =
            msg.includes("not found") || msg.includes("userIds") || msg.includes("status")
                ? 400
                : 500;
        return res.status(status).json({
            success: false,
            error: status === 400 ? "Bad Request" : "Internal Server Error",
            message: msg,
        });
    }
};
