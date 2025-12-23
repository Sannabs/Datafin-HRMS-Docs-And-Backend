import express from "express";
import {
    getAllPayslips,
    getPayslipById,
    downloadPayslip,
    getEmployeePayslips,
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

// Employee-specific route (employees can view their own)
router.get("/employee/:employeeId", requireRole(["HR_ADMIN", "HR_STAFF", "EMPLOYEE"]), getEmployeePayslips);

// Individual payslip routes
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF", "EMPLOYEE"]), getPayslipById);
router.get("/:id/download", requireRole(["HR_ADMIN", "HR_STAFF", "EMPLOYEE"]), downloadPayslip);

export default router;

