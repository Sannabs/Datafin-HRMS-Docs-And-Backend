import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
    listOvertimeApprovals,
    postOvertimeApprovalDecision,
} from "../controllers/overtime-approval.controller.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN"]), listOvertimeApprovals);
router.post("/decision", requireRole(["HR_ADMIN"]), postOvertimeApprovalDecision);

export default router;
