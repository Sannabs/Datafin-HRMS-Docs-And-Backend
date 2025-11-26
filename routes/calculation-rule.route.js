import express from "express";
import {
    getAllCalculationRules,
    getCalculationRuleById,
    createCalculationRule,
    updateCalculationRule,
    deleteCalculationRule,
    testCalculationRule,
} from "../controllers/calculation-rule.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllCalculationRules);
router.post("/", requireRole(["HR_ADMIN"]), createCalculationRule);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getCalculationRuleById);
router.put("/:id", requireRole(["HR_ADMIN"]), updateCalculationRule);
router.delete("/:id", requireRole(["HR_ADMIN"]), deleteCalculationRule);
router.post("/:id/test", requireRole(["HR_ADMIN", "HR_STAFF"]), testCalculationRule);

export default router;

