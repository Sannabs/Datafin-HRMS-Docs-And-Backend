import express from "express";
import {
    createPayrollRun,
    startPayrollRun,
    getPayrollRuns,
    getPayrollRunById,
    processSingleEmployee,
    getPayrollRunStatus,
    getPayrollRunStatusStream,
    previewPayrollRun,
} from "../controllers/payroll-run.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/", requireRole(["HR_ADMIN"]), createPayrollRun);
router.post("/preview", requireRole(["HR_ADMIN"]), previewPayrollRun);
router.post("/:id/start", requireRole(["HR_ADMIN"]), startPayrollRun);
router.post("/:id/process-employee", requireRole(["HR_ADMIN"]), processSingleEmployee);
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRuns);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunById);
router.get("/:id/status", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunStatus);
router.get("/:id/status/stream", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunStatusStream);

export default router;

