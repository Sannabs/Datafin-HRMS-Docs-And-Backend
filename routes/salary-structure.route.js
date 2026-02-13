import express from "express";
import {
    getAllSalaryStructures,
    getEmployeeSalaryStructure,
    getEmployeeSalaryStructures,
    getMySalaryStructure,
    getMySalaryStructures,
    createSalaryStructure,
    updateSalaryStructure,
    deactivateSalaryStructure,
    activateSalaryStructure,
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

// Employee self-service routes (must be before parameterized routes)
router.get("/me/salary-structure", getMySalaryStructure);
router.get("/me/salary-structures", getMySalaryStructures);

// HR view routes (HR can view any employee's salary structure)
router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllSalaryStructures);
router.get("/employees/:id/salary-structure", requireRole(["HR_ADMIN", "HR_STAFF"]), getEmployeeSalaryStructure);
router.get("/employees/:id/salary-structures", requireRole(["HR_ADMIN", "HR_STAFF"]), getEmployeeSalaryStructures);

// HR Admin only - modify salary structures
router.post("/employees/:id/salary-structure", requireRole(["HR_ADMIN"]), createSalaryStructure);
router.put("/salary-structures/:id", requireRole(["HR_ADMIN"]), updateSalaryStructure);
router.put("/salary-structures/:id/deactivate", requireRole(["HR_ADMIN"]), deactivateSalaryStructure);
router.put("/salary-structures/:id/activate", requireRole(["HR_ADMIN"]), activateSalaryStructure);
// Hard delete: HR_ADMIN only (super admin for payroll). Audit logged before delete.
router.delete("/salary-structures/:id", requireRole(["HR_ADMIN"]), deleteSalaryStructure);
router.post("/salary-structures/:id/allowances", requireRole(["HR_ADMIN"]), addAllowanceToStructure);
router.delete("/salary-structures/:id/allowances/:allowanceId", requireRole(["HR_ADMIN"]), removeAllowanceFromStructure);
router.post("/salary-structures/:id/deductions", requireRole(["HR_ADMIN"]), addDeductionToStructure);
router.delete("/salary-structures/:id/deductions/:deductionId", requireRole(["HR_ADMIN"]), removeDeductionFromStructure);

export default router;

