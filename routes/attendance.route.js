import express from "express";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import {
  clockInGPS,
  clockInWiFi,
  clockInQRCode,
  clockInPhoto,
  clockOutGPS,
  clockOutWiFi,
  clockOutQRCode,
  clockOutPhoto,
  getAttendanceHistory,
  getMyAttendanceHistory
} from "../controllers/attendance.controller.js";

const router = express.Router();

router.use(requireAuth);

// Clock-In Routes
router.post("/clock-in/gps", clockInGPS);
router.post("/clock-in/wifi", clockInWiFi);
router.post("/clock-in/qrcode", clockInQRCode);
router.post("/clock-in/photo", clockInPhoto);

// Clock-Out Routes
router.post("/clock-out/gps", clockOutGPS);
router.post("/clock-out/wifi", clockOutWiFi);
router.post("/clock-out/qrcode", clockOutQRCode);
router.post("/clock-out/photo", clockOutPhoto);

// Attendance History
router.get("/history", getAttendanceHistory);
router.get("/my-history/:employeeId", getMyAttendanceHistory);

export default router;
