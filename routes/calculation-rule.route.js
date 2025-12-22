import express from "express";
import {
    getAllCalculationRules,
    getCalculationRuleById,
    createCalculationRule,
    updateCalculationRule,
    deleteCalculationRule,
    testCalculationRule,
    getRuleOperators,
    getRuleCacheStats,
    validateRuleConditions,
} from "../controllers/calculation-rule.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

// Rule engine info endpoints
router.get("/operators", requireRole(["HR_ADMIN", "HR_STAFF"]), getRuleOperators);
router.get("/cache-stats", requireRole(["HR_ADMIN"]), getRuleCacheStats);
router.post("/validate-conditions", requireRole(["HR_ADMIN", "HR_STAFF"]), validateRuleConditions);

// CRUD endpoints
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllCalculationRules);
router.post("/", requireRole(["HR_ADMIN"]), createCalculationRule);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getCalculationRuleById);
router.put("/:id", requireRole(["HR_ADMIN"]), updateCalculationRule);
router.delete("/:id", requireRole(["HR_ADMIN"]), deleteCalculationRule);
router.post("/:id/test", requireRole(["HR_ADMIN", "HR_STAFF"]), testCalculationRule);

export default router;

