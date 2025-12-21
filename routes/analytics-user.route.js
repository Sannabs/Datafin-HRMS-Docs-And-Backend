import express from "express";
import {
  getUsersOverview,
  getUserRegistrationsSeries,
  getUserLoginsSeries,
  getUserLoginRecency,
} from "../controllers/analytics-user.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/overview", requireRole(["HR_ADMIN", "HR_STAFF"]), getUsersOverview);

router.get(
  "/registrations",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  getUserRegistrationsSeries
);

router.get(
  "/logins",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  getUserLoginsSeries
);

router.get(
  "/recency",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  getUserLoginRecency
);

export default router;
