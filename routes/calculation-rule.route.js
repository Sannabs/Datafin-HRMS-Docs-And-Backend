import express from "express";
import {
    getAllCalculationRules,
    getCalculationRuleById,
    createCalculationRule,
    updateCalculationRule,
    deleteCalculationRule,
    activateCalculationRule,
    deactivateCalculationRule,
    testCalculationRule,
    getRuleOperators,
    getRuleCacheStats,
    validateRuleConditions,
    getFormulaHelp,
    validateFormulaEndpoint,
    testFormula,
} from "../controllers/calculation-rule.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

// Rule engine info endpoints
router.get("/operators", requireRole(["HR_ADMIN", "HR_STAFF"]), getRuleOperators);
router.get("/cache-stats", requireRole(["HR_ADMIN"]), getRuleCacheStats);
router.post("/validate-conditions", requireRole(["HR_ADMIN", "HR_STAFF"]), validateRuleConditions);

// Formula endpoints
router.get("/formula/help", requireRole(["HR_ADMIN", "HR_STAFF"]), getFormulaHelp);
router.post("/formula/validate", requireRole(["HR_ADMIN", "HR_STAFF"]), validateFormulaEndpoint);
router.post("/formula/test", requireRole(["HR_ADMIN", "HR_STAFF"]), testFormula);

// CRUD endpoints
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllCalculationRules);
router.post("/", requireRole(["HR_ADMIN"]), createCalculationRule);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getCalculationRuleById);
router.put("/:id/activate", requireRole(["HR_ADMIN"]), activateCalculationRule);
router.put("/:id/deactivate", requireRole(["HR_ADMIN"]), deactivateCalculationRule);
router.put("/:id", requireRole(["HR_ADMIN"]), updateCalculationRule);
router.delete("/:id", requireRole(["HR_ADMIN"]), deleteCalculationRule);
router.post("/:id/test", requireRole(["HR_ADMIN", "HR_STAFF"]), testCalculationRule);

export default router;

