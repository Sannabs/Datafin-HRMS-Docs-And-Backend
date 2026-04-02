import express from "express";
import {
    getAllEmployees,
    getEmployeeById,
    exportEmployees,
    createEmployee,
    updateEmployee,
    updateEmployeeIdDigits,
    terminateEmployee,
    reactivateEmployee,
    archiveEmployee,
    restoreEmployee,
    updateMyProfle,
    updateProfilePicture,
    removeProfilePicture,
    getHomeStats,
    getEmployeePayrollOverview,
    getEmployeeDocuments,
    uploadEmployeeDocument,
    downloadEmployeeDocument,
    deleteEmployeeDocument,
} from "../controllers/employee.controller.js";
import { getEmployeeCombinedFeed } from "../controllers/employee-feed.controller.js";
import {
    listEmployeeWarnings,
    createEmployeeWarningDraft,
    updateEmployeeWarningDraft,
    submitEmployeeWarningForReview,
    issueEmployeeWarning,
} from "../controllers/employee-warning.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
    uploadSingleImage,
    uploadEmployeeDocuments,
} from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]), getAllEmployees);
router.get("/export", requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]), exportEmployees);
router.post(
    "/",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    createEmployee
);
router.get("/me", getEmployeeById);
router.patch("/my-profile", updateMyProfle);
router.get("/home-stats", getHomeStats);
router.patch("/my-profile-picture", uploadSingleImage, updateProfilePicture);
router.delete("/my-profile-picture", removeProfilePicture);
router.get("/:userId/combined-feed", getEmployeeCombinedFeed);
router.get(
    "/:id/warnings",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN", "STAFF"]),
    listEmployeeWarnings
);
router.post(
    "/:id/warnings",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    createEmployeeWarningDraft
);
router.patch(
    "/:id/warnings/:warningId",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    updateEmployeeWarningDraft
);
router.post(
    "/:id/warnings/:warningId/submit",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    submitEmployeeWarningForReview
);
router.post(
    "/:id/warnings/:warningId/issue",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    issueEmployeeWarning
);
router.get("/:id/documents", getEmployeeDocuments);
router.post(
    "/:id/documents",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    uploadEmployeeDocuments,
    uploadEmployeeDocument
);
router.get("/:id/documents/:documentId/download", downloadEmployeeDocument);
router.delete(
    "/:id/documents/:documentId",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    deleteEmployeeDocument
);
router.get("/:id/payroll-overview", getEmployeePayrollOverview);
router.get("/:id", getEmployeeById);
router.patch("/:id/employee-id", requireRole(["HR_ADMIN", "HR_STAFF"]), updateEmployeeIdDigits);
router.put("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]),   updateEmployee);
router.post("/:id/terminate", requireRole(["HR_ADMIN", "HR_STAFF"]), terminateEmployee);
router.post("/:id/reactivate", requireRole(["HR_ADMIN", "HR_STAFF"]), reactivateEmployee);
router.post("/:id/archive", requireRole(["HR_ADMIN", "HR_STAFF"]), archiveEmployee);
router.post("/:id/restore", requireRole(["HR_ADMIN", "HR_STAFF"]), restoreEmployee);

export default router;

