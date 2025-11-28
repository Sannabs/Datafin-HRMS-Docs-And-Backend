import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { getAuditLogs } from "../controllers/audit.controller.js";


const router = express.Router();

router.use(requireAuth);
router.get('/', requireRole("HR_ADMIN"), getAuditLogs)



export default router;