import express from "express";
import {
    getAllEmployees,
    getEmployeeById,
    updateEmployee,
    updateEmployeeIdDigits,
    terminateEmployee,
    reactivateEmployee,
    archiveEmployee,
    restoreEmployee,
} from "../controllers/employee.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]), getAllEmployees);
router.get("/:id", getEmployeeById);
router.patch("/:id/employee-id", requireRole(["HR_ADMIN", "HR_STAFF"]), updateEmployeeIdDigits);
router.put("/:id", updateEmployee);
router.post("/:id/terminate", requireRole(["HR_ADMIN", "HR_STAFF"]), terminateEmployee);
router.post("/:id/reactivate", requireRole(["HR_ADMIN", "HR_STAFF"]), reactivateEmployee);
router.post("/:id/archive", requireRole(["HR_ADMIN", "HR_STAFF"]), archiveEmployee);
router.post("/:id/restore", requireRole(["HR_ADMIN", "HR_STAFF"]), restoreEmployee);

export default router;

