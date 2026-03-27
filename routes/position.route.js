import express from "express";
import {
  getAllPositions,
  createPosition,
} from "../controllers/position.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

// List positions
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]), getAllPositions);

// Create position
router.post("/", requireRole(["HR_ADMIN", "HR_STAFF"]), createPosition);

export default router;

