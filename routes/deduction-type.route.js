import express from "express";
import {
    getAllDeductionTypes,
    getDeductionTypeById,
    createDeductionType,
    updateDeductionType,
    deleteDeductionType,
    activateDeductionType,
    deactivateDeductionType,
} from "../controllers/deduction-type.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllDeductionTypes);
router.post("/", requireRole(["HR_ADMIN"]), createDeductionType);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getDeductionTypeById);
router.put("/:id/activate", requireRole(["HR_ADMIN"]), activateDeductionType);
router.put("/:id/deactivate", requireRole(["HR_ADMIN"]), deactivateDeductionType);
router.put("/:id", requireRole(["HR_ADMIN"]), updateDeductionType);
router.delete("/:id", requireRole(["HR_ADMIN"]), deleteDeductionType);

export default router;

