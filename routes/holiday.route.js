import express from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import {
    getAllHolidays,
    getHolidayById,
    createHoliday,
    updateHoliday,
    deleteHoliday,
    bulkCreateHolidays,
    getHolidaysInRange,
    getHolidayTypes,
} from "../controllers/holiday.controller.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(requireAuth);

// Get holiday types (available to all authenticated users)
router.get("/types", getHolidayTypes);

// Get holidays in a date range (for calendars)
router.get("/range", getHolidaysInRange);

// List all holidays
router.get("/", getAllHolidays);

// Get a single holiday
router.get("/:id", getHolidayById);

// Create a new holiday (HR_ADMIN only)
router.post("/", requireRole(["HR_ADMIN"]), createHoliday);

// Bulk create holidays (HR_ADMIN only)
router.post("/bulk", requireRole(["HR_ADMIN"]), bulkCreateHolidays);

// Update a holiday (HR_ADMIN only)
router.patch("/:id", requireRole(["HR_ADMIN"]), updateHoliday);

// Delete a holiday (HR_ADMIN only)
router.delete("/:id", requireRole(["HR_ADMIN"]), deleteHoliday);

export default router;

