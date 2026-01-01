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
  lateReason,
  manualClockOut,
} from "../controllers/attendance.controller.js";

const router = express.Router();

router.use(requireAuth);

// Clock-In Routes (with optional photo upload)
router.post("/clock-in/gps", uploadSingleImage, clockInGPS);
router.post("/clock-in/wifi", uploadSingleImage, clockInWiFi);
router.post("/clock-in/qrcode", uploadSingleImage, clockInQRCode);

// Clock-Out Routes (with optional photo upload)
router.post("/clock-out/gps", uploadSingleImage, clockOutGPS);
router.post("/clock-out/wifi", uploadSingleImage, clockOutWiFi);
router.post("/clock-out/qrcode", uploadSingleImage, clockOutQRCode);

// Attendance History
router.get("/history", getAttendanceHistory);
router.get("/my-history/:employeeId", getMyAttendanceHistory);

// Late Reason (Employee)
router.patch("/:attendanceId/late-reason", lateReason);

// Manual Clock-Out (Admin Only)
router.post("/manual-clock-out", requireRole(["HR_ADMIN", "HR_STAFF"]), manualClockOut);

export default router;
