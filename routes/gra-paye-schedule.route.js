import express from "express";
import { listGraPayeSchedules } from "../controllers/gra-paye-schedule.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", requireRole(["HR_ADMIN", "HR_STAFF"]), listGraPayeSchedules);

export default router;
