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
} from "../controllers/employee.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { uploadSingleImage } from "../middlewares/upload.middleware.js";

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
router.get("/:id", getEmployeeById);
router.patch("/:id/employee-id", requireRole(["HR_ADMIN", "HR_STAFF"]), updateEmployeeIdDigits);
router.put("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]),   updateEmployee);
router.post("/:id/terminate", requireRole(["HR_ADMIN", "HR_STAFF"]), terminateEmployee);
router.post("/:id/reactivate", requireRole(["HR_ADMIN", "HR_STAFF"]), reactivateEmployee);
router.post("/:id/archive", requireRole(["HR_ADMIN", "HR_STAFF"]), archiveEmployee);
router.post("/:id/restore", requireRole(["HR_ADMIN", "HR_STAFF"]), restoreEmployee);

export default router;

