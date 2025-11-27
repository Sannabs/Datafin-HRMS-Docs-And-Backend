import express from "express";
import {
    createPayrollRun,
    startPayrollRun,
    getPayrollRuns,
    getPayrollRunById,
    processSingleEmployee,
} from "../controllers/payroll-run.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/", requireRole(["HR_ADMIN"]), createPayrollRun);
router.post("/:id/start", requireRole(["HR_ADMIN"]), startPayrollRun);
router.post("/:id/process-employee", requireRole(["HR_ADMIN"]), processSingleEmployee);
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRuns);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunById);

export default router;

