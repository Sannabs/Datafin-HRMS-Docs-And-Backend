import express from "express";
import { listSshfcRemittances } from "../controllers/sshfc-remittance.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), listSshfcRemittances);

export default router;
