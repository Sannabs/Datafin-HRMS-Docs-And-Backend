import express from "express";
import {
    getPayslipById,
    downloadPayslip,
    getEmployeePayslips,
} from "../controllers/payslip.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF", "EMPLOYEE"]), getPayslipById);
router.get("/:id/download", requireRole(["HR_ADMIN", "HR_STAFF", "EMPLOYEE"]), downloadPayslip);
router.get("/employee/:employeeId", requireRole(["HR_ADMIN", "HR_STAFF", "EMPLOYEE"]), getEmployeePayslips);

export default router;

