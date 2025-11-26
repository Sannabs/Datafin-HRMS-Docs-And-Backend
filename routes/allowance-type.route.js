import express from "express";
import {
    getAllAllowanceTypes,
    getAllowanceTypeById,
    createAllowanceType,
    updateAllowanceType,
    deleteAllowanceType,
} from "../controllers/allowance-type.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllAllowanceTypes);
router.post("/", requireRole(["HR_ADMIN"]), createAllowanceType);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllowanceTypeById);
router.put("/:id", requireRole(["HR_ADMIN"]), updateAllowanceType);
router.delete("/:id", requireRole(["HR_ADMIN"]), deleteAllowanceType);

export default router;

