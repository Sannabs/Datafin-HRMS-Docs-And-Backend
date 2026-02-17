import express from "express";
import {
    getAllPaySchedules,
    getPayScheduleById,
    createPaySchedule,
    updatePaySchedule,
    deletePaySchedule,
    activatePaySchedule,
    deactivatePaySchedule,
    generatePeriods,
} from "../controllers/pay-schedule.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), getAllPaySchedules);
router.get("/:id", requireRole(["HR_ADMIN", "HR_STAFF"]), getPayScheduleById);
router.post("/", requireRole(["HR_ADMIN"]), createPaySchedule);
router.patch("/:id", requireRole(["HR_ADMIN"]), updatePaySchedule);
router.put("/:id/activate", requireRole(["HR_ADMIN"]), activatePaySchedule);
router.put("/:id/deactivate", requireRole(["HR_ADMIN"]), deactivatePaySchedule);
router.delete("/:id", requireRole(["HR_ADMIN"]), deletePaySchedule);
router.post("/:id/generate-periods", requireRole(["HR_ADMIN"]), generatePeriods);

export default router;
