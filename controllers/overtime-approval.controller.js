import logger from "../utils/logger.js";
import {
    listOvertimeRowsForPayPeriod,
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
        const status = error.message === "Pay period not found" ? 404 : 500;
        return res.status(status).json({
            success: false,
            error: status === 404 ? "Not Found" : "Internal Server Error",
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
