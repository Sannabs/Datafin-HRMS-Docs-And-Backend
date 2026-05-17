import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { uploadLeaveAttachments } from "../middlewares/upload.middleware.js";
import {
  // Policy
  getLeavePolicy,
  updateLeavePolicy,
  // Types
  getAllLeaveTypes,
  createLeaveType,
  updateLeaveType,
  // Requests
  getAllLeaveRequests,
  getMyLeaveRequests,
  getPendingLeaveRequestsForManagerApproval,
  getLeaveRequestById,
  createLeaveRequest,
  managerApproveLeaveRequest,
  hrApproveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  // Balance
  getMyLeaveBalance,
  getEmployeeLeaveBalance,
  getAllLeaveBalances,
  adjustLeaveBalance,
  initializeLeaveEntitlement,
  getLeaveStats,
  recomputeEntitlements,
  emailLeaveEntitlementSummary,
} from "../controllers/leave.controller.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// ============================================
// LEAVE POLICY ROUTES
// ============================================
router.get("/policy", getLeavePolicy);
router.patch("/policy", requireRole(["HR_ADMIN"]), updateLeavePolicy);

// ============================================
// LEAVE TYPE ROUTES
// ============================================
router.get("/types", getAllLeaveTypes);
router.post("/types", requireRole(["HR_ADMIN"]), createLeaveType);
router.patch("/types/:id", requireRole(["HR_ADMIN"]), updateLeaveType);

// ============================================
// LEAVE REQUEST ROUTES
// ============================================
// Note: Specific routes must come before parameterized routes
router.get("/requests/my", getMyLeaveRequests);
router.get("/stats", getLeaveStats);
router.get(
  "/requests/pending/manager",
  getPendingLeaveRequestsForManagerApproval
);
router.get(
  "/requests",
  requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
  getAllLeaveRequests
);
router.get("/requests/:id", getLeaveRequestById);
router.post("/requests", uploadLeaveAttachments, createLeaveRequest);
router.post(
  "/requests/:id/manager-approve",
  requireRole(["DEPARTMENT_ADMIN"]),
  managerApproveLeaveRequest
);
router.post(
  "/requests/:id/hr-approve",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  hrApproveLeaveRequest
);
router.post(
  "/requests/:id/reject",
  requireRole(["DEPARTMENT_ADMIN", "HR_ADMIN", "HR_STAFF"]),
  rejectLeaveRequest
);
router.post("/requests/:id/cancel", cancelLeaveRequest);

// ============================================
// LEAVE BALANCE ROUTES
// ============================================
router.get("/balance", getMyLeaveBalance);
router.get(
  "/balance/:userId",
  requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
  getEmployeeLeaveBalance
);

router.get(
  "/balances",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  getAllLeaveBalances
);
router.post(
  "/balance/:userId/adjust",
  requireRole(["HR_ADMIN"]),
  adjustLeaveBalance
);
router.post(
  "/balance/:userId/initialize",
  requireRole(["HR_ADMIN"]),
  initializeLeaveEntitlement
);
router.post(
  "/balance/recompute-entitlements",
  requireRole(["HR_ADMIN"]),
  recomputeEntitlements
);
router.post(
  "/email-entitlement-summary",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  emailLeaveEntitlementSummary
);

export default router;