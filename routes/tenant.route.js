import express from "express";
import {
    getTenantProfile,
    updateTenantProfile,
    getPayrollSettings,
    updatePayrollSettings,
    updateCompanyLogo,
    removeCompanyLogo,
} from "../controllers/tenant.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { uploadSingleImage } from "../middlewares/upload.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getTenantProfile);
router.patch("/", requireRole(["HR_ADMIN"]), updateTenantProfile);

router.get("/payroll-settings", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayrollSettings);
router.patch("/payroll-settings", requireRole(["HR_ADMIN"]), updatePayrollSettings);

// Company logo endpoints
router.patch("/logo", requireRole(["HR_ADMIN"]), uploadSingleImage, updateCompanyLogo);
router.delete("/logo", requireRole(["HR_ADMIN"]), removeCompanyLogo);

export default router;
