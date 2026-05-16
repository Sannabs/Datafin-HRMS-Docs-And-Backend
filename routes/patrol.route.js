import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
    scanCheckpoint,
    createSite,
    getSites,
    updateSite,
    deleteSite,
    createCheckpoint,
    getCheckpoints,
    updateCheckpoint,
    deleteCheckpoint,
    createSchedule,
    getSchedules,
    updateSchedule,
    deleteSchedule,
    getSessions,
    getMySchedules,
    getMySessions,
    setupSite,
} from "../controllers/patrol.controller.js";

const router = express.Router();

router.use(requireAuth);

// Guard / field — any authenticated user with an active schedule can scan
router.post("/scan", scanCheckpoint);

// Current user (mobile / employee)
router.get("/me/schedules", getMySchedules);
router.get("/me/sessions", getMySessions);

// Sites
router.post("/sites", requireRole(["HR_ADMIN", "HR_STAFF"]), createSite);
router.get(
    "/sites",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    getSites
);

// Setup (create site + checkpoints in one go)
router.post("/sites/setup", requireRole(["HR_ADMIN", "HR_STAFF"]), setupSite);
router.patch("/sites/:siteId", requireRole(["HR_ADMIN", "HR_STAFF"]), updateSite);
router.delete("/sites/:siteId", requireRole(["HR_ADMIN", "HR_STAFF"]), deleteSite);

// Checkpoints (nested under site + by id)
router.post(
    "/sites/:siteId/checkpoints",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    createCheckpoint
);
router.get(
    "/sites/:siteId/checkpoints",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    getCheckpoints
);
router.patch(
    "/checkpoints/:checkpointId",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    updateCheckpoint
);
router.delete(
    "/checkpoints/:checkpointId",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    deleteCheckpoint
);

// Schedules
router.post("/schedules", requireRole(["HR_ADMIN", "HR_STAFF"]), createSchedule);
router.get(
    "/schedules",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    getSchedules
);
router.patch(
    "/schedules/:scheduleId",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    updateSchedule
);
router.delete(
    "/schedules/:scheduleId",
    requireRole(["HR_ADMIN", "HR_STAFF"]),
    deleteSchedule
);

// Sessions (reporting)
router.get(
    "/sessions",
    requireRole(["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"]),
    getSessions
);

export default router;
