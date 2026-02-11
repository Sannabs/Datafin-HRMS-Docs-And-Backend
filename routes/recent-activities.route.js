import express from "express";
import { getRecentActivities } from "../controllers/recent-activities.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();
router.use(requireAuth);
router.get("/", getRecentActivities);

export default router;
