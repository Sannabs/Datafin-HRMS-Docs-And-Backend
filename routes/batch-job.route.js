import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { uploadCsvSingle } from "../middlewares/upload-csv.middleware.js";
import {
    listBatchJobs,
    listBatchJobCreators,
    validateBatchCsv,
    getBatchJobById,
    getBatchJobRows,
    exportBatchJobRows,
    createEmployeeCreationBatch,
    createEmployeeInvitationBatch,
    createBulkUpdateBatch,
    createAllowanceAllocationBatch,
    createDeductionAllocationBatch,
    startBatchJob,
    retryBatchJob,
    getBatchJobStatusStream,
} from "../controllers/batch-job.controller.js";

const router = express.Router();

const hrRoles = ["HR_ADMIN", "HR_STAFF"];

router.use(requireAuth);
router.use(requireRole([...hrRoles, "SUPER_ADMIN"]));

router.get("/creators", listBatchJobCreators);
router.post("/validate-csv", uploadCsvSingle, validateBatchCsv);
router.get("/", listBatchJobs);

router.post("/employee-creation", uploadCsvSingle, createEmployeeCreationBatch);
router.post("/employee-invitation", uploadCsvSingle, createEmployeeInvitationBatch);
router.post("/bulk-update", uploadCsvSingle, createBulkUpdateBatch);
router.post("/allowance-allocation", createAllowanceAllocationBatch);
router.post("/deduction-allocation", createDeductionAllocationBatch);

router.get("/:id/status/stream", getBatchJobStatusStream);
router.get("/:id/rows", getBatchJobRows);
router.get("/:id/export", exportBatchJobRows);
router.post("/:id/start", startBatchJob);
router.post("/:id/retry", retryBatchJob);
router.get("/:id", getBatchJobById);

export default router;
