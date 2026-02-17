import express from "express";
import {
    createPayPeriod,
    getPayPeriods,
    getPayPeriodById,
    updatePayPeriod,
    updatePayPeriodStatus,
    deletePayPeriod,
    pauseAutoClose,
    resumeAutoClose,
} from "../controllers/pay-period.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.post("/", requireRole(["HR_ADMIN"]), createPayPeriod);
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayPeriods);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayPeriodById);
router.patch("/:id/status", requireRole(["HR_ADMIN"]), updatePayPeriodStatus);
router.patch("/:id", requireRole(["HR_ADMIN"]), updatePayPeriod);
router.post("/:id/pause-auto-close", requireRole(["HR_ADMIN"]), pauseAutoClose);
router.post("/:id/resume-auto-close", requireRole(["HR_ADMIN"]), resumeAutoClose);
router.delete("/:id", requireRole(["HR_ADMIN"]), deletePayPeriod);

export default router;

