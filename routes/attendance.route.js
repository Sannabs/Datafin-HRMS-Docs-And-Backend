import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { uploadSingleImage } from "../middlewares/upload.middleware.js";
import {
  clockInGPS,
  clockInWiFi,
  clockInQRCode,
  clockOutGPS,
  clockOutWiFi,
  clockOutQRCode,
  getAttendanceHistory,
  getMyAttendanceHistory,
  getMyTodayStatus,
  getMyAttendanceStats,
  lateReason,
  manualClockOut,
  createOrUpdateEmployeeWorkConfig,
  getEmployeeWorkConfig,
  createOrUpdateCompanyWorkDay,
  getCompanyWorkDay,
  getTenantAttendanceSettings,
  getTenantLocations,
  createTenantLocation,
  updateTenantLocation,
  deleteTenantLocation,
  updateTenantAttendanceSettings,
  createAttendance,
  adminClockInToday,
  adminClockOutToday,
  adminUpdateAttendanceRecord,
  markExcusedAbsenceToday,
} from "../controllers/attendance.controller.js";

const router = express.Router();

router.use(requireAuth);

// Clock-In Routes (with optional photo upload)
router.post("/clock-in/gps", uploadSingleImage, clockInGPS);
router.post("/clock-in/wifi", uploadSingleImage, clockInWiFi);
router.post("/clock-in/qrcode", uploadSingleImage, clockInQRCode);

// Clock-Out Routes (no photo – photo only on clock-in when required by tenant)
router.post("/clock-out/gps", clockOutGPS);
router.post("/clock-out/wifi", clockOutWiFi);
router.post("/clock-out/qrcode", clockOutQRCode);

// Attendance History & Stats
router.get("/history", getAttendanceHistory);
router.get("/my-history", getMyAttendanceHistory);
router.get("/today-status", getMyTodayStatus);
router.get("/my-stats", getMyAttendanceStats);

// Late Reason (Employee)
router.patch("/:attendanceId/late-reason", lateReason);

// Manual Clock-Out (Admin Only)
router.post("/manual-clock-out/:attendanceId", requireRole(["HR_ADMIN", "HR_STAFF"]), manualClockOut);

// Employee Work Config (Admin/HR)
router.post("/config/employee-work-day", requireRole(["HR_ADMIN", "HR_STAFF"]), createOrUpdateEmployeeWorkConfig);
router.get("/config/employee-work-day/:userId", requireRole(["HR_ADMIN", "HR_STAFF"]), getEmployeeWorkConfig);

// Company Work Day (Admin Only)
router.post("/config/company-work-day", requireRole(["HR_ADMIN"]), createOrUpdateCompanyWorkDay);
router.get("/config/company-work-day", requireRole(["HR_ADMIN", "HR_STAFF"]), getCompanyWorkDay);

// Tenant Attendance Settings (Admin Only)
router.get("/config/settings", requireRole(["HR_ADMIN", "HR_STAFF"]), getTenantAttendanceSettings);
router.patch("/config/settings", requireRole(["HR_ADMIN"]), updateTenantAttendanceSettings);

// Tenant Locations (Attendance)
router.get("/config/locations", requireRole(["HR_ADMIN", "HR_STAFF"]), getTenantLocations);
router.post("/config/locations", requireRole(["HR_ADMIN"]), createTenantLocation);
router.patch("/config/locations/:id", requireRole(["HR_ADMIN"]), updateTenantLocation);
router.delete("/config/locations/:id", requireRole(["HR_ADMIN"]), deleteTenantLocation);



// Manual attendance (admin)
router.post("/manual-create", requireRole(["HR_ADMIN"]), createAttendance);
router.post(
  "/manual-today/:userId/clock-in",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  adminClockInToday
);
router.post(
  "/manual-today/:userId/clock-out",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  adminClockOutToday
);
router.post(
  "/excused-absence/:userId",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  markExcusedAbsenceToday
);
router.patch(
  "/manual/update/:attendanceId",
  requireRole(["HR_ADMIN", "HR_STAFF"]),
  adminUpdateAttendanceRecord
);

export default router;
