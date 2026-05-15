import express from "express";
import {
    createPayrollRun,
    updatePayrollRun,
    deletePayrollRun,
    startPayrollRun,
    getPayrollRuns,
    getPayrollFilterOptions,
    getPayrollRunById,
    downloadGraPayeSchedulePdf,
    downloadSshfcRemittancePdf,
    getPayrollRunRecords,
    exportPayrollRuns,
    processSingleEmployee,
    getPayrollRunStatus,
    getPayrollRunStatusStream,
    previewPayrollRun,
    getPayrollJobStatus,
    getPayrollQueueMetrics,
    retryPayrollJob,
    getQueueConfig,
} from "../controllers/payroll-run.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

// Payroll run CRUD and processing
router.post("/", requireRole(["HR_ADMIN"]), createPayrollRun);
router.patch("/:id", requireRole(["HR_ADMIN"]), updatePayrollRun);
router.delete("/:id", requireRole(["HR_ADMIN"]), deletePayrollRun);
router.post("/preview", requireRole(["HR_ADMIN"]), previewPayrollRun);
router.post("/:id/start", requireRole(["HR_ADMIN"]), startPayrollRun);
router.post("/:id/process-employee", requireRole(["HR_ADMIN"]), processSingleEmployee);
router.post("/:id/retry", requireRole(["HR_ADMIN"]), retryPayrollJob);
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRuns);
router.get("/filter-options", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollFilterOptions);
router.get("/export", requireRole(["HR_ADMIN", "HR_STAFF"]), exportPayrollRuns);
router.get("/:id/records", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunRecords);
router.get("/:id/gra-paye-schedule/pdf", requireRole(["HR_ADMIN", "HR_STAFF"]), downloadGraPayeSchedulePdf);
router.get("/:id/sshfc-remittance/pdf", requireRole(["HR_ADMIN", "HR_STAFF"]), downloadSshfcRemittancePdf);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunById);
router.get("/:id/status", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunStatus);
router.get("/:id/status/stream", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollRunStatusStream);

// Queue-related endpoints (BullMQ is now required)
router.get("/queue/config", requireRole(["HR_ADMIN"]), getQueueConfig);
router.get("/queue/metrics", requireRole(["HR_ADMIN"]), getPayrollQueueMetrics);
router.get("/:id/job-status", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollJobStatus);

export default router;

