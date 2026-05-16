import express from "express";
import {
  getAllDepartments,
  createDepartment,
  updateDepartment,
} from "../controllers/department.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

// List departments (for dropdowns, etc.)
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]), getAllDepartments);

// Create department
router.post("/", requireRole(["HR_ADMIN", "HR_STAFF"]), createDepartment);

// Update department (currently: manager assignment only)
router.patch("/:id", requireRole(["HR_ADMIN"]), updateDepartment);

export default router;

