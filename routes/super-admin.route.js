import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  listCompanies,
  getCompanyById,
  createCompany,
  updateCompany,
  activateCompany,
  suspendCompany,
  sendCompanyInvitationAsSuperAdmin,
  listPlatformAdmins,
  getPlatformAdminById,
  invitePlatformAdmin,
  suspendPlatformAdmin,
  activatePlatformAdmin,
  deletePlatformAdmin,
  startImpersonation,
  stopImpersonation,
} from "../controllers/super-admin.controller.js";
import { sendInvitation } from "../controllers/invitations.controller.js";

const router = express.Router();

router.use(requireAuth, requireRole(["SUPER_ADMIN"]));

// Companies
router.get("/companies", listCompanies);
router.get("/companies/:companyId", getCompanyById);
router.post("/companies", createCompany);
router.patch("/companies/:companyId", updateCompany);
router.post("/companies/:companyId/activate", activateCompany);
router.post("/companies/:companyId/suspend", suspendCompany);

// Invitations for a specific company (delegate to existing invitation logic)
router.post(
  "/companies/:companyId/invitations",
  sendCompanyInvitationAsSuperAdmin,
  sendInvitation
);

// Platform admins
router.get("/admins", listPlatformAdmins);
router.get("/admins/:userId", getPlatformAdminById);
router.post("/admins/invite", invitePlatformAdmin);
router.post("/admins/:userId/suspend", suspendPlatformAdmin);
router.post("/admins/:userId/activate", activatePlatformAdmin);
router.delete("/admins/:userId", deletePlatformAdmin);

// Impersonation
router.post("/impersonation/start", startImpersonation);
router.post("/impersonation/stop", stopImpersonation);

export default router;

