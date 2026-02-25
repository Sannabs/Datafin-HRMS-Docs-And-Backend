import express from "express";
import {
    getAllPayslips,
    getPayslipById,
    downloadPayslip,
    getEmployeePayslips,
    getMyPayslips,
    getMyLatestPayslip,
    getPayslipsByPayrollRun,
    bulkDownloadPayslips,
    exportPayslips,
    distributePayslips,
    getDistributionReport,
} from "../controllers/payslip.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

// HR Admin/Staff endpoints (must be before :id routes to avoid conflicts)
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllPayslips);
router.post("/export", requireRole(["HR_ADMIN", "HR_STAFF"]), exportPayslips);

// Payroll run specific routes
router.get("/payroll-run/:runId", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayslipsByPayrollRun);
router.get("/payroll-run/:runId/bulk-download", requireRole(["HR_ADMIN", "HR_STAFF"]), bulkDownloadPayslips);
router.post("/payroll-run/:runId/distribute", requireRole(["HR_ADMIN"]), distributePayslips);
router.get("/payroll-run/:runId/distribution-report", requireRole(["HR_ADMIN", "HR_STAFF"]), getDistributionReport);

// Employee-specific route (staff can view their own)
router.get("/employee/:employeeId", requireRole(["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"]), getEmployeePayslips);

// My payslips (current user)
router.get("/my", requireRole(["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"]), getMyPayslips);
router.get("/my/latest", requireRole(["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"]), getMyLatestPayslip);

// Individual payslip routes
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"]), getPayslipById);
router.get("/:id/download", requireRole(["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"]), downloadPayslip);

export default router;

