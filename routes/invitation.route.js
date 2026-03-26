import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  sendInvitation,
  sendSetupInvitation,
  getInvitations,
  acceptInvitation,
} from "../controllers/invitations.controller.js";

const router = express.Router();

router.post("/", requireAuth, requireRole(["HR_ADMIN", "HR_STAFF"]), sendInvitation);
router.post("/setup/:employeeId", requireAuth, requireRole(["HR_ADMIN", "HR_STAFF"]), sendSetupInvitation);
router.get("/", requireAuth, getInvitations);
router.post("/accept/:token", acceptInvitation);

export default router;
