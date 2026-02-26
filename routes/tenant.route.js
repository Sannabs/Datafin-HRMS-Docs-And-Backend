import express from "express";
import {
    getTenantProfile,
    updateTenantProfile,
    getPayrollSettings,
    updatePayrollSettings,
} from "../controllers/tenant.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getTenantProfile);
router.patch("/", requireRole(["HR_ADMIN"]), updateTenantProfile);

router.get("/payroll-settings", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollSettings);
router.patch("/payroll-settings", requireRole(["HR_ADMIN"]), updatePayrollSettings);

export default router;
