import express from "express";
import {
  listShifts,
  createShift,
  updateShift,
  deleteShift,
} from "../controllers/shift.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get(
  "/",
  requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
  listShifts
);
// router.get("/:employeeId", requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]), getEmployeeShift);
router.post("/", requireRole(["HR_ADMIN"]), createShift);
router.patch("/:id", requireRole(["HR_ADMIN"]), updateShift);
router.delete("/:id", requireRole(["HR_ADMIN"]), deleteShift);

export default router;
