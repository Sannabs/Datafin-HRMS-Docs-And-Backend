import express from "express";
import {
    getEmployeeSalaryStructure,
    getEmployeeSalaryStructures,
    createSalaryStructure,
    updateSalaryStructure,
    deleteSalaryStructure,
    addAllowanceToStructure,
    removeAllowanceFromStructure,
    addDeductionToStructure,
    removeDeductionFromStructure,
} from "../controllers/salary-structure.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/employees/:id/salary-structure", getEmployeeSalaryStructure);
router.get("/employees/:id/salary-structures", getEmployeeSalaryStructures);
router.post("/employees/:id/salary-structure", requireRole(["HR_ADMIN", "HR_STAFF"]), createSalaryStructure);
router.put("/salary-structures/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), updateSalaryStructure);
router.delete("/salary-structures/:id", requireRole(["HR_ADMIN"]), deleteSalaryStructure);
router.post("/salary-structures/:id/allowances", requireRole(["HR_ADMIN", "HR_STAFF"]), addAllowanceToStructure);
router.delete("/salary-structures/:id/allowances/:allowanceId", requireRole(["HR_ADMIN", "HR_STAFF"]), removeAllowanceFromStructure);
router.post("/salary-structures/:id/deductions", requireRole(["HR_ADMIN", "HR_STAFF"]), addDeductionToStructure);
router.delete("/salary-structures/:id/deductions/:deductionId", requireRole(["HR_ADMIN", "HR_STAFF"]), removeDeductionFromStructure);

export default router;

