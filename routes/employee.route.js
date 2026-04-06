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
    acknowledgeEmployeeWarning,
    refuseEmployeeWarningAcknowledgement,
    submitEmployeeWarningAppeal,
    reviewEmployeeWarningAppeal,
    decideEmployeeWarningAppeal,
    resolveEmployeeWarning,
    voidEmployeeWarning,
    escalateEmployeeWarning,
    uploadEmployeeWarningAttachments,
    downloadEmployeeWarningAttachment,
    deleteEmployeeWarningAttachment,
    deleteEmployeeWarningDraft,
    returnEmployeeWarningToDraft,
    resendWarningIssuedNotification,
    listDisciplineWarningsDashboard,
    getEmployeeWarningEscalationSummary,
    getEmployeeWarningById,
    getEmployeeWarningTimeline,
    duplicateEmployeeWarningAsDraft,
    exportEmployeeWarningPackage,
    downloadEmployeeWarningLetterPdf,
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
    "/warnings/dashboard",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    listDisciplineWarningsDashboard
);
router.get(
    "/:id/warnings/escalation-summary",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN", "STAFF"]),
    getEmployeeWarningEscalationSummary
);
router.get(
    "/:id/warnings/:warningId/timeline",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN", "STAFF"]),
    getEmployeeWarningTimeline
);
router.get(
    "/:id/warnings/:warningId/export",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN", "STAFF"]),
    exportEmployeeWarningPackage
);
router.get(
    "/:id/warnings/:warningId/letter-pdf",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN", "STAFF"]),
    downloadEmployeeWarningLetterPdf
);
router.post(
    "/:id/warnings/:warningId/duplicate",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    duplicateEmployeeWarningAsDraft
);
router.get(
    "/:id/warnings/:warningId",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN", "STAFF"]),
    getEmployeeWarningById
);
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
router.delete(
    "/:id/warnings/:warningId",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    deleteEmployeeWarningDraft
);
router.post(
    "/:id/warnings/:warningId/attachments",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    uploadEmployeeDocuments,
    uploadEmployeeWarningAttachments
);
router.get(
    "/:id/warnings/:warningId/attachments/:attachmentId/download",
    downloadEmployeeWarningAttachment
);
router.delete(
    "/:id/warnings/:warningId/attachments/:attachmentId",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    deleteEmployeeWarningAttachment
);
router.post(
    "/:id/warnings/:warningId/submit",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    submitEmployeeWarningForReview
);
router.post(
    "/:id/warnings/:warningId/return-to-draft",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    returnEmployeeWarningToDraft
);
router.post(
    "/:id/warnings/:warningId/issue",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    issueEmployeeWarning
);
router.post(
    "/:id/warnings/:warningId/resend-issued-notification",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    resendWarningIssuedNotification
);
router.post(
    "/:id/warnings/:warningId/acknowledge",
    requireRole(["HR_ADMIN", "HR_STAFF", "STAFF"]),
    acknowledgeEmployeeWarning
);
router.post(
    "/:id/warnings/:warningId/refuse-acknowledgement",
    requireRole(["HR_ADMIN", "HR_STAFF", "STAFF"]),
    refuseEmployeeWarningAcknowledgement
);
router.post(
    "/:id/warnings/:warningId/appeal/review",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    reviewEmployeeWarningAppeal
);
router.post(
    "/:id/warnings/:warningId/appeal/decision",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    decideEmployeeWarningAppeal
);
router.post(
    "/:id/warnings/:warningId/appeal",
    requireRole(["HR_ADMIN", "HR_STAFF", "STAFF"]),
    submitEmployeeWarningAppeal
);
router.post(
    "/:id/warnings/:warningId/resolve",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    resolveEmployeeWarning
);
router.post(
    "/:id/warnings/:warningId/void",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    voidEmployeeWarning
);
router.post(
    "/:id/warnings/:warningId/escalate",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    escalateEmployeeWarning
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

