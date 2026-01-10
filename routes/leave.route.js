import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from '../middlewares/rbac.middleware.js';
import {
    // Policy
    getLeavePolicy,
    createLeavePolicy,
    updateLeavePolicy,
    // Types
    getAllLeaveTypes,
    getLeaveTypeById,
    createLeaveType,
    updateLeaveType,
    deleteLeaveType,
    // Requests
    getAllLeaveRequests,
    getMyLeaveRequests,
    getPendingLeaveRequests,
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
router.delete("/types/:id", requireRole(["HR_ADMIN"]), deleteLeaveType);

// ============================================
// LEAVE REQUEST ROUTES
// ============================================
router.get("/requests", getAllLeaveRequests);
router.get("/requests/my", getMyLeaveRequests);
router.get("/requests/pending", getPendingLeaveRequests);
router.get("/requests/:id", getLeaveRequestById);
router.post("/requests", createLeaveRequest);
router.post("/requests/:id/manager-approve", requireRole(["DEPARTMENT_ADMIN"]), managerApproveLeaveRequest);
router.post("/requests/:id/hr-approve", requireRole(["HR_ADMIN", "HR_STAFF"]), hrApproveLeaveRequest);
router.post("/requests/:id/reject", requireRole(["DEPARTMENT_ADMIN", "HR_ADMIN", "HR_STAFF"]), rejectLeaveRequest);
router.post("/requests/:id/cancel", cancelLeaveRequest);

// ============================================
// LEAVE BALANCE ROUTES
// ============================================
router.get("/balance", getMyLeaveBalance);
router.get("/balance/:userId", requireRole(["HR_ADMIN", "HR_STAFF"]), getEmployeeLeaveBalance);
router.get("/balances", requireRole(["HR_ADMIN"]), getAllLeaveBalances);
router.post("/balance/:userId/adjust", requireRole(["HR_ADMIN"]), adjustLeaveBalance);
router.post("/balance/:userId/initialize", requireRole(["HR_ADMIN"]), initializeLeaveEntitlement);

export default router;