import prisma from "../config/prisma.config.js";
import {
  ClockInWindow,
  determineAttendanceStatus,
  verifyQRPayload,
  withInLocationRange,
  isSameWifi,
  handlePhotoUpload,
  calculateHours,
} from "../utils/attendance.util.js";
import logger from "../utils/logger.js";
import { recordRecentActivity } from "../utils/activity.util.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

// Clock-In Controllers
export const clockInGPS = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { latitude, longitude } = req.body;
  const clockInDeviceInfo = req.headers["user-agent"] || null;
  const clockInIpAddress =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    null;

  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    if (!latitude || !longitude) {
      logger.error(
        "Latitude and Longitude are required check your location settings"
      );
      return res.status(400).json({
        success: false,
        error: "Latitude and Longitude are required",
        message:
          "Latitude and Longitude are required check your location settings",
      });
    }

    const employee = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId: tenantId,
      },
      include: {
        shift: true,
        employeeWorkConfig: true,
        tenant: { include: { companyWorkDay: true } },
      },
    });

    if (!employee) {
      logger.error("Employee not found");
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    // within location range
    const isWithinLocationRange = withInLocationRange(
      latitude,
      longitude,
      employee.tenant.location,
      employee.tenant.geofenceRadius
    );

    if (!isWithinLocationRange.valid) {
      logger.error("Not in location range");
      return res.status(400).json({
        success: false,
        error: "Not in location range",
        message: "You are not in the location range",
      });
    }

    const now = new Date();
    const isClockInAllowed = ClockInWindow(
      employee.shift,
      employee.tenant.earlyClockInMinutes,
      now
    );

    if (!isClockInAllowed.valid) {
      logger.error(
        `Clock in not allowed: ${isClockInAllowed.message} - ${isClockInAllowed.windowStart}`
      );
      return res.status(400).json({
        success: false,
        error: "Clock in not allowed",
        message: `You are not allowed to clock in at this time ${isClockInAllowed.windowStart}`,
      });
    }

    const attendanceStatus = determineAttendanceStatus(
      now,
      employee.shift,
      employee.tenant.gracePeriodMinutes ?? 5
    );

    // Handle photo upload if required or provided
    let clockInPhotoUrl = null;
    if (employee.tenant.requirePhoto || req.file || req.body.photoUrl) {
      clockInPhotoUrl = await handlePhotoUpload(
        req,
        userId,
        tenantId,
        "clock-in"
      );

      if (employee.tenant.requirePhoto && !clockInPhotoUrl) {
        logger.error("Photo is required but not provided");
        return res.status(400).json({
          success: false,
          error: "Photo is required",
          message: "Photo verification is mandatory for clock-in",
        });
      }
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        locationId: isWithinLocationRange.location.id,
        clockInTime: now,
        status: attendanceStatus,
        clockInMethod: "GPS",
        clockInPhotoUrl,
        clockInDeviceInfo,
        clockInIpAddress,
      },
    });

    const timeStr = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    await recordRecentActivity(tenantId, userId, "clock_in", `Clocked in at ${timeStr}`);

    res.status(200).json({
      success: true,
      message: `Clock in successful - ${attendanceStatus}`,
      data: attendance,
    });
  } catch (error) {
    logger.error(`Error clocking in: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock in",
    });
  }
};

export const clockInWiFi = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { wifiSSID } = req.body;
  const clockInDeviceInfo = req.headers["user-agent"] || null;
  const clockInIpAddress =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    null;

  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    if (!wifiSSID) {
      logger.error("WiFi SSID is required");
      return res.status(400).json({
        success: false,
        error: "WiFi SSID is required",
        message: "WiFi SSID is required",
      });
    }

    const employee = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId: tenantId,
      },
      include: {
        shift: true,
        employeeWorkConfig: true,
        tenant: { include: { companyWorkDay: true } },
      },
    });

    if (!employee) {
      logger.error("Employee not found");
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    const wifiCheck = await isSameWifi(wifiSSID, employee.tenant.location);

    if (!wifiCheck.valid) {
      logger.error("You are not connected to the companies WiFi");
      return res.status(400).json({
        success: false,
        error: "You are not connected to the companies WiFi",
        message: "You are not connected to the companies WiFi",
      });
    }

    const now = new Date();
    const isClockInAllowed = ClockInWindow(
      employee.shift,
      employee.tenant.earlyClockInMinutes,
      now
    );

    if (!isClockInAllowed.valid) {
      logger.error(
        `Clock in not allowed: ${isClockInAllowed.message} - ${isClockInAllowed.windowStart}`
      );
      return res.status(400).json({
        success: false,
        error: "Clock in not allowed",
        message: `You are not allowed to clock in at this time ${isClockInAllowed.windowStart}`,
      });
    }

    const attendanceStatus = determineAttendanceStatus(
      now,
      employee.shift,
      employee.tenant.gracePeriodMinutes ?? 5
    );

    // Handle photo upload if required or provided
    let clockInPhotoUrl = null;
    if (employee.tenant.requirePhoto || req.file || req.body.photoUrl) {
      clockInPhotoUrl = await handlePhotoUpload(
        req,
        userId,
        tenantId,
        "clock-in"
      );

      if (employee.tenant.requirePhoto && !clockInPhotoUrl) {
        logger.error("Photo is required but not provided");
        return res.status(400).json({
          success: false,
          error: "Photo is required",
          message: "Photo verification is mandatory for clock-in",
        });
      }
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        locationId: wifiCheck.location.id,
        clockInTime: now,
        status: attendanceStatus,
        clockInMethod: "WIFI",
        clockInPhotoUrl,
        clockInDeviceInfo,
        clockInIpAddress,
      },
    });

    const timeStrWifi = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    await recordRecentActivity(tenantId, userId, "clock_in", `Clocked in at ${timeStrWifi}`);

    res.status(200).json({
      success: true,
      message: `Clock in successful - ${attendanceStatus}`,
      data: attendance,
    });
  } catch (error) {
    logger.error(`Error clocking in: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock in",
    });
  }
};

export const clockInQRCode = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { qrPayload, latitude, longitude } = req.body;
  const clockInDeviceInfo = req.headers["user-agent"] || null;
  const clockInIpAddress =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    null;
  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    if (!qrPayload) {
      logger.error("QR Payload is required");
      return res.status(400).json({
        success: false,
        error: "QR Payload is required",
        message: "QR Payload is required",
      });
    }

    if (!latitude || !longitude) {
      logger.error(
        "Latitude and Longitude are required check your location settings"
      );
      return res.status(400).json({
        success: false,
        error: "Latitude and Longitude are required",
        message:
          "Latitude and Longitude are required check your location settings",
      });
    }

    const employee = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId: tenantId,
      },
      include: {
        shift: true,
        employeeWorkConfig: true,
        tenant: { include: { companyWorkDay: true } },
      },
    });

    if (!employee) {
      logger.error("Employee not found");
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    // within location range
    const isWithinLocationRange = withInLocationRange(
      latitude,
      longitude,
      employee.tenant.location,
      employee.tenant.geofenceRadius
    );

    if (!isWithinLocationRange.valid) {
      logger.error("Not in location range");
      return res.status(400).json({
        success: false,
        error: "Not in location range",
        message: "You are not in the location range",
      });
    }

    const now = new Date();
    const isClockInAllowed = ClockInWindow(
      employee.shift,
      employee.tenant.earlyClockInMinutes,
      now
    );

    if (!isClockInAllowed.valid) {
      logger.error(
        `Clock in not allowed: ${isClockInAllowed.message} - ${isClockInAllowed.windowStart}`
      );
      return res.status(400).json({
        success: false,
        error: "Clock in not allowed",
        message: `You are not allowed to clock in at this time ${isClockInAllowed.windowStart}`,
      });
    }

    const isQRPayloadValid = verifyQRPayload(qrPayload);

    if (!isQRPayloadValid.valid) {
      logger.error("Invalid QR Payload");
      return res.status(400).json({
        success: false,
        error: "Invalid QR Payload",
        message: "Invalid QR Payload",
      });
    }

    const attendanceStatus = determineAttendanceStatus(
      now,
      employee.shift,
      employee.tenant.gracePeriodMinutes ?? 5
    );

    // Handle photo upload if required or provided
    let clockInPhotoUrl = null;
    if (employee.tenant.requirePhoto || req.file || req.body.photoUrl) {
      clockInPhotoUrl = await handlePhotoUpload(
        req,
        userId,
        tenantId,
        "clock-in"
      );

      if (employee.tenant.requirePhoto && !clockInPhotoUrl) {
        logger.error("Photo is required but not provided");
        return res.status(400).json({
          success: false,
          error: "Photo is required",
          message: "Photo verification is mandatory for clock-in",
        });
      }
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        locationId: isWithinLocationRange.location.id,
        clockInTime: now,
        status: attendanceStatus,
        clockInMethod: "QR CODE",
        clockInPhotoUrl,
        clockInDeviceInfo,
        clockInIpAddress,
      },
    });

    const timeStrQR = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    await recordRecentActivity(tenantId, userId, "clock_in", `Clocked in at ${timeStrQR}`);

    res.status(200).json({
      success: true,
      message: `Clock in successful - ${attendanceStatus}`,
      data: attendance,
    });
  } catch (error) {
    logger.error(`Error clocking in: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock in",
    });
  }
};

// Clock-Out Controllers
export const clockOutGPS = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { latitude, longitude } = req.body;
  const clockOutDeviceInfo = req.headers["user-agent"] || null;
  const clockOutIpAddress =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    null;

  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    if (!latitude || !longitude) {
      logger.error(
        "Latitude and Longitude are required check your location settings"
      );
      return res.status(400).json({
        success: false,
        error: "Latitude and Longitude are required",
        message:
          "Latitude and Longitude are required check your location settings",
      });
    }

    const employee = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId: tenantId,
      },
      include: {
        shift: true,
        employeeWorkConfig: true,
        tenant: { include: { companyWorkDay: true } },
      },
    });

    if (!employee) {
      logger.error("Employee not found");
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    // within location range
    const isWithinLocationRange = withInLocationRange(
      latitude,
      longitude,
      employee.tenant.location,
      employee.tenant.geofenceRadius
    );

    if (!isWithinLocationRange.valid) {
      logger.error("Not in location range");
      return res.status(400).json({
        success: false,
        error: "Not in location range",
        message: "You are not in the location range",
      });
    }

    // Find today's attendance record for the user, then update it with clock out info
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceRecord = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        clockInTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { clockInTime: "desc" },
    });

    if (!attendanceRecord) {
      logger.error("No attendance record found to clock out.");
      return res.status(404).json({
        success: false,
        error: "No attendance record found for today to clock out.",
        message: "You have not clock in today, please clock in first",
      });
    }

    // Calculate total hours and overtime
    const { totalHours, overtimeHours } = calculateHours(
      attendanceRecord.clockInTime,
      now,
      employee.shift
    );

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceRecord.id },
      data: {
        clockOutTime: now,
        clockOutMethod: "GPS",
        clockOutDeviceInfo,
        clockOutIpAddress,
        totalHours,
        overtimeHours,
      },
    });

    const timeStrOut = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    await recordRecentActivity(tenantId, userId, "clock_out", `Clocked out at ${timeStrOut}`);

    res.status(200).json({
      success: true,
      message: `Clock out successful - ${updatedAttendance.status}`,
      data: updatedAttendance,
    });
  } catch (error) {
    logger.error(`Error clocking out: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock out",
    });
  }
};

export const clockOutWiFi = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { wifiSSID } = req.body;
  const clockOutDeviceInfo = req.headers["user-agent"] || null;
  const clockOutIpAddress =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    null;

  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    if (!wifiSSID) {
      logger.error("WiFi SSID is required");
      return res.status(400).json({
        success: false,
        error: "WiFi SSID is required",
        message: "WiFi SSID is required",
      });
    }

    const employee = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId: tenantId,
      },
      include: {
        shift: true,
        employeeWorkConfig: true,
        tenant: { include: { companyWorkDay: true } },
      },
    });

    if (!employee) {
      logger.error("Employee not found");
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    const wifiCheck = await isSameWifi(wifiSSID, employee.tenant.location);

    if (!wifiCheck.valid) {
      logger.error("You are not connected to the companies WiFi");
      return res.status(400).json({
        success: false,
        error: "You are not connected to the companies WiFi",
        message: "You are not connected to the companies WiFi",
      });
    }

    // Find today's attendance record for the user, then update it with clock out info
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceRecord = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        clockInTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { clockInTime: "desc" },
    });

    if (!attendanceRecord) {
      logger.error("No attendance record found to clock out.");
      return res.status(404).json({
        success: false,
        error: "No attendance record found for today to clock out.",
        message: "You have not clock in today, please clock in first",
      });
    }

    // Calculate total hours and overtime
    const { totalHours, overtimeHours } = calculateHours(
      attendanceRecord.clockInTime,
      now,
      employee.shift
    );

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceRecord.id },
      data: {
        clockOutTime: now,
        clockOutMethod: "WIFI",
        clockOutDeviceInfo,
        clockOutIpAddress,
        totalHours,
        overtimeHours,
      },
    });

    const timeStrOutWifi = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    await recordRecentActivity(tenantId, userId, "clock_out", `Clocked out at ${timeStrOutWifi}`);

    res.status(200).json({
      success: true,
      message: `Clock out successful - ${updatedAttendance.status}`,
      data: updatedAttendance,
    });
  } catch (error) {
    logger.error(`Error clocking out: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock out",
    });
  }
};

export const clockOutQRCode = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { qrPayload, latitude, longitude } = req.body;
  const clockOutDeviceInfo = req.headers["user-agent"] || null;
  const clockOutIpAddress =
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.connection?.remoteAddress ||
    null;

  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    if (!qrPayload) {
      logger.error("QR Payload is required");
      return res.status(400).json({
        success: false,
        error: "QR Payload is required",
        message: "QR Payload is required",
      });
    }

    if (!latitude || !longitude) {
      logger.error(
        "Latitude and Longitude are required check your location settings"
      );
      return res.status(400).json({
        success: false,
        error: "Latitude and Longitude are required",
        message:
          "Latitude and Longitude are required check your location settings",
      });
    }

    const employee = await prisma.user.findUnique({
      where: {
        id: userId,
        tenantId: tenantId,
      },
      include: {
        shift: true,
        employeeWorkConfig: true,
        tenant: { include: { companyWorkDay: true } },
      },
    });

    if (!employee) {
      logger.error("Employee not found");
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    // within location range
    const isWithinLocationRange = withInLocationRange(
      latitude,
      longitude,
      employee.tenant.location,
      employee.tenant.geofenceRadius
    );

    if (!isWithinLocationRange.valid) {
      logger.error("Not in location range");
      return res.status(400).json({
        success: false,
        error: "Not in location range",
        message: "You are not in the location range",
      });
    }

    const isQRPayloadValid = verifyQRPayload(qrPayload);

    if (!isQRPayloadValid.valid) {
      logger.error("Invalid QR Payload");
      return res.status(400).json({
        success: false,
        error: "Invalid QR Payload",
        message: "Invalid QR Payload",
      });
    }

    // Find today's attendance record for the user, then update it with clock out info
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceRecord = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        clockInTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { clockInTime: "desc" },
    });

    if (!attendanceRecord) {
      logger.error("No attendance record found to clock out.");
      return res.status(404).json({
        success: false,
        error: "No attendance record found for today to clock out.",
        message: "You have not clock in today, please clock in first",
      });
    }

    // Calculate total hours and overtime
    const { totalHours, overtimeHours } = calculateHours(
      attendanceRecord.clockInTime,
      now,
      employee.shift
    );

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceRecord.id },
      data: {
        clockOutTime: now,
        clockOutMethod: "QR_CODE",
        clockOutDeviceInfo,
        clockOutIpAddress,
        totalHours,
        overtimeHours,
      },
    });

    const timeStrOutQR = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    await recordRecentActivity(tenantId, userId, "clock_out", `Clocked out at ${timeStrOutQR}`);

    res.status(200).json({
      success: true,
      message: `Clock out successful - ${updatedAttendance.status}`,
      data: updatedAttendance,
    });
  } catch (error) {
    logger.error(`Error clocking out: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock out",
    });
  }
};

// Attendance History
export const getAttendanceHistory = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;

  try {
    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    // Pagination
    const page = parseInt(req.query.page || 1);
    const limit = Math.min(parseInt(req.query.limit || 10), 100);
    const skip = (page - 1) * limit;

    if (page < 1 || limit < 1) {
      return res.status(400).json({
        success: false,
        error: "Invalid page or limit",
        message: "Page and limit must be greater than 0",
      });
    }

    // Filters
    const {
      status,
      method,
      userId,
      search,
      locationId,
    } = req.query;

    // Build where clause
    const where = {
      tenantId,
    };

    // Filter by user/employee
    if (userId) {
      where.userId = userId;
    }

    // Filter by status
    if (status) {
      const validStatuses = ["ON_TIME", "LATE", "EARLY", "ABSENT"];
      if (validStatuses.includes(status.toUpperCase())) {
        where.status = status.toUpperCase();
      }
    }

    if (method) {
      const m = String(method).toUpperCase().replace(/\s+/g, "_");
      const validMethods = ["GPS", "WIFI", "QR_CODE", "PHOTO", "MANUAL"];
      if (validMethods.includes(m)) {
        where.clockInMethod = m;
      }
    }

    if (locationId) {
      where.locationId = locationId;
    }

    if (search) {
      const searchTerm = search.trim();
      where.OR = [
        {
          user: {
            OR: [
              { name: { contains: searchTerm, mode: "insensitive" } },
              { email: { contains: searchTerm, mode: "insensitive" } },
              { employeeId: { contains: searchTerm, mode: "insensitive" } },
            ],
          },
        },
        {
          location: {
            name: { contains: searchTerm, mode: "insensitive" },
          },
        },
      ];
    }


    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              image: true,
              email: true,
              employeeId: true,
              shift: {
                select: {
                  id: true,
                  name: true,
                  startTime: true,
                  endTime: true,
                },
              },
            },
          },
          location: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: "Attendance history retrieved successfully",
      data: attendance,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(`Error getting attendance history: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get attendance history",
    });
  }
};

/**
 * Lightweight endpoint: current user's clock-in status for today only.
 * Use this for the Clock In / Clock Out button instead of loading full history.
 */
export const getMyTodayStatus = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;

  try {
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "User ID or Tenant ID is required",
        message: "User ID or Tenant ID is required",
      });
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const todayRecord = await prisma.attendance.findFirst({
      where: {
        tenantId,
        userId,
        clockInTime: { gte: startOfDay, lte: endOfDay },
        clockOutTime: null,
      },
      orderBy: { clockInTime: "desc" },
      select: {
        id: true,
        clockInTime: true,
        clockOutTime: true,
        status: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Today's status retrieved successfully",
      data: {
        hasOpenClockIn: !!todayRecord,
        todayRecord: todayRecord || null,
      },
    });
  } catch (error) {
    logger.error(`Error getting today status: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get today's attendance status",
    });
  }
};

/**
 * Total attendance stats for stat cards: present (ON_TIME/EARLY), late (LATE), absent (ABSENT).
 * Counts total records per status (efficient: three count queries in parallel).
 */
export const getMyAttendanceStats = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;

  try {
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    const baseWhere = { tenantId, userId };

    const [present, late, absent] = await Promise.all([
      prisma.attendance.count({
        where: { ...baseWhere, status: { in: ["ON_TIME", "EARLY"] } },
      }),
      prisma.attendance.count({
        where: { ...baseWhere, status: "LATE" },
      }),
      prisma.attendance.count({
        where: { ...baseWhere, status: "ABSENT" },
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Attendance stats retrieved successfully",
      data: { present, late, absent },
    });
  } catch (error) {
    logger.error(`Error getting attendance stats: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get attendance stats",
    });
  }
};

export const getMyAttendanceHistory = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;

  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    // Simple pagination
    const page = parseInt(req.query.page || 1);
    const limit = Math.min(parseInt(req.query.limit || 20), 50);
    const skip = (page - 1) * limit;

    // Optional date range filter
    const { startDate, endDate } = req.query;

    const where = {
      tenantId,
      userId,
    };

    // Date range filtering (optional)
    if (startDate || endDate) {
      where.clockInTime = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.clockInTime.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.clockInTime.lte = end;
      }
    }

    // Get attendance records (most recent first)
    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { clockInTime: "desc" },
        select: {
          id: true,
          clockInTime: true,
          clockOutTime: true,
          totalHours: true,
          overtimeHours: true,
          status: true,
          notes: true,
          location: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.attendance.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: "Attendance history retrieved successfully",
      data: attendance,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(`Error getting my attendance history: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get attendance history",
    });
  }
};

export const lateReason = async (req, res) => {
  const userId = req.user.id;
  const attendanceId = req.params.attendanceId;
  const { notes } = req.body;

  try {
    if (!userId || !attendanceId) {
      logger.error("User ID or Attendance ID is required");
      return res.status(400).json({
        success: false,
        error: "User ID or Attendance ID is required",
        message: "User ID or Attendance ID is required",
      });
    }

    if (!notes) {
      logger.error("Notes are required");
      return res.status(400).json({
        success: false,
        error: "Notes are required",
        message: "Notes are required",
      });
    }

    const attendance = await prisma.attendance.findUnique({
      where: {
        id: attendanceId,
        userId,
      },
    });

    if (!attendance) {
      logger.error("Attendance not found");
      return res.status(404).json({
        success: false,
        error: "Attendance not found",
        message: "Attendance not found",
      });
    }

    // Only allow notes for LATE or ABSENT attendance
    if (attendance.status !== "LATE" && attendance.status !== "ABSENT") {
      logger.error("Attendance is not late or absent");
      return res.status(400).json({
        success: false,
        error: "Attendance is not late or absent",
        message: "Only late or absent attendance can have notes attached",
      });
    }

    const updatedAttendance = await prisma.attendance.update({
      where: {
        id: attendanceId,
      },
      data: {
        notes,
      },
    });

    res.status(200).json({
      success: true,
      message: "Late reason updated successfully",
      data: updatedAttendance,
    });
  } catch (error) {
    logger.error(`Error updating late reason: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update late reason",
    });
  }
};

// Manual Clock-Out (Admin Only)
export const manualClockOut = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { clockOutTime, reason } = req.body;

  const attendanceId = req.params.attendanceId;

  try {
    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    if (!attendanceId) {
      logger.error("Attendance ID is required");
      return res.status(400).json({
        success: false,
        error: "Attendance ID is required",
        message: "Attendance ID is required",
      });
    }

    // Find attendance record
    const attendance = await prisma.attendance.findFirst({
      where: {
        id: attendanceId,
        tenantId,
        clockOutTime: null, // Only allow if not already clocked out
      },
      include: {
        user: {
          include: {
            shift: true,
          },
        },
      },
    });

    if (!attendance) {
      logger.error("Attendance not found or already clocked out");
      return res.status(404).json({
        success: false,
        error: "Attendance not found",
        message: "Attendance record not found or employee already clocked out",
      });
    }

    // Use provided clock-out time or current time
    const outTime = clockOutTime ? new Date(clockOutTime) : new Date();

    // Validate clock-out time is after clock-in time
    if (outTime <= attendance.clockInTime) {
      return res.status(400).json({
        success: false,
        error: "Invalid clock-out time",
        message: "Clock-out time must be after clock-in time",
      });
    }

    // Calculate hours if shift exists
    let totalHours = null;
    let overtimeHours = 0;

    if (attendance.user.shift) {
      const hours = calculateHours(
        attendance.clockInTime,
        outTime,
        attendance.user.shift
      );
      totalHours = hours.totalHours;
      overtimeHours = hours.overtimeHours;
    } else {
      // If no shift, just calculate total hours
      const totalMilliseconds = outTime - attendance.clockInTime;
      totalHours =
        Math.round((totalMilliseconds / (1000 * 60 * 60)) * 100) / 100;
    }

    const normalizedReason =
      typeof reason === "string" && reason.trim() ? reason.trim() : null;
    const manualNote = normalizedReason
      ? `Manually clocked out by admin (${normalizedReason})`
      : "Manually clocked out by admin";

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        clockOutTime: outTime,
        clockOutMethod: "MANUAL",
        totalHours,
        overtimeHours,
        notes: attendance.notes
          ? `${attendance.notes} | ${manualNote}`
          : manualNote,
      },
    });

    await addLog(
      req.user.id,
      tenantId,
      "UPDATE",
      "Attendance",
      updatedAttendance.id,
      {
        employeeUserId: attendance.userId,
        clockOutTime: outTime.toISOString(),
        totalHours,
        overtimeHours,
        reason: normalizedReason,
        message: "Manual clock-out by admin",
      },
      req
    );

    res.status(200).json({
      success: true,
      message: "Employee clocked out successfully",
      data: updatedAttendance,
    });
  } catch (error) {
    logger.error(`Error in manual clock-out: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock out employee",
    });
  }
};

// ============================================
// Configuration Controllers
// ============================================

// Employee Work Config Controllers
export const createOrUpdateEmployeeWorkConfig = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const {
    userId,
    monday,
    tuesday,
    wednesday,
    thursday,
    friday,
    saturday,
    sunday,
  } = req.body;

  try {
    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    if (!userId) {
      logger.error("User ID is required");
      return res.status(400).json({
        success: false,
        error: "User ID is required",
        message: "User ID is required",
      });
    }

    // Verify user belongs to tenant
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
      },
    });

    if (!user) {
      logger.error("User not found or doesn't belong to tenant");
      return res.status(404).json({
        success: false,
        error: "User not found",
        message: "User not found or doesn't belong to your organization",
      });
    }

    // Create or update employee work config
    const workConfig = await prisma.employeeWorkConfig.upsert({
      where: { userId },
      update: {
        monday: monday !== undefined ? monday : true,
        tuesday: tuesday !== undefined ? tuesday : true,
        wednesday: wednesday !== undefined ? wednesday : true,
        thursday: thursday !== undefined ? thursday : true,
        friday: friday !== undefined ? friday : true,
        saturday: saturday !== undefined ? saturday : false,
        sunday: sunday !== undefined ? sunday : false,
      },
      create: {
        userId,
        monday: monday !== undefined ? monday : true,
        tuesday: tuesday !== undefined ? tuesday : true,
        wednesday: wednesday !== undefined ? wednesday : true,
        thursday: thursday !== undefined ? thursday : true,
        friday: friday !== undefined ? friday : true,
        saturday: saturday !== undefined ? saturday : false,
        sunday: sunday !== undefined ? sunday : false,
      },
    });

    res.status(200).json({
      success: true,
      message: "Employee work configuration updated successfully",
      data: workConfig,
    });
  } catch (error) {
    logger.error(
      `Error creating/updating employee work config: ${error.message}`,
      {
        stack: error.stack,
      }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update employee work configuration",
    });
  }
};

export const getEmployeeWorkConfig = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { userId } = req.params;

  try {
    if (!tenantId || !userId) {
      logger.error("Tenant ID or User ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID or User ID is required",
        message: "Tenant ID or User ID is required",
      });
    }

    // Verify user belongs to tenant
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
      },
    });

    if (!user) {
      logger.error("User not found or doesn't belong to tenant");
      return res.status(404).json({
        success: false,
        error: "User not found",
        message: "User not found or doesn't belong to your organization",
      });
    }

    const workConfig = await prisma.employeeWorkConfig.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
          },
        },
      },
    });

    if (!workConfig) {
      return res.status(404).json({
        success: false,
        error: "Work configuration not found",
        message:
          "Employee work configuration not found. Use create endpoint to set it up.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Employee work configuration retrieved successfully",
      data: workConfig,
    });
  } catch (error) {
    logger.error(`Error getting employee work config: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get employee work configuration",
    });
  }
};


// Company Work Day Controllers
export const createOrUpdateCompanyWorkDay = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { monday, tuesday, wednesday, thursday, friday, saturday, sunday } =
    req.body;

  try {
    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    // Create or update company work day
    const companyWorkDay = await prisma.companyWorkDay.upsert({
      where: { tenantId },
      update: {
        monday: monday !== undefined ? monday : true,
        tuesday: tuesday !== undefined ? tuesday : true,
        wednesday: wednesday !== undefined ? wednesday : true,
        thursday: thursday !== undefined ? thursday : true,
        friday: friday !== undefined ? friday : true,
        saturday: saturday !== undefined ? saturday : false,
        sunday: sunday !== undefined ? sunday : false,
      },
      create: {
        tenantId,
        monday: monday !== undefined ? monday : true,
        tuesday: tuesday !== undefined ? tuesday : true,
        wednesday: wednesday !== undefined ? wednesday : true,
        thursday: thursday !== undefined ? thursday : true,
        friday: friday !== undefined ? friday : true,
        saturday: saturday !== undefined ? saturday : false,
        sunday: sunday !== undefined ? sunday : false,
      },
    });

    res.status(200).json({
      success: true,
      message: "Company work day configuration updated successfully",
      data: companyWorkDay,
    });
  } catch (error) {
    logger.error(`Error creating/updating company work day: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update company work day configuration",
    });
  }
};

export const getCompanyWorkDay = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;

  try {
    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    let companyWorkDay = await prisma.companyWorkDay.findUnique({
      where: { tenantId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    // Auto-create with defaults if not exists (Mon-Fri standard)
    if (!companyWorkDay) {
      companyWorkDay = await prisma.companyWorkDay.create({
        data: {
          tenantId,
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: false,
          sunday: false,
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      });

      logger.info(
        `Auto-created company work day configuration for tenant ${tenantId} with default values (Mon-Fri)`
      );
    }

    res.status(200).json({
      success: true,
      message: "Company work day configuration retrieved successfully",
      data: companyWorkDay,
    });
  } catch (error) {
    logger.error(`Error getting company work day: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get company work day configuration",
    });
  }
};

// Tenant Attendance Settings Controllers
export const getTenantAttendanceSettings = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;

  try {
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        gracePeriodMinutes: true,
        earlyClockInMinutes: true,
        geofenceRadius: true,
        requirePhoto: true,
        allowedClockInMethods: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: "Tenant not found",
        message: "Tenant not found",
      });
    }

    res.status(200).json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    logger.error(
      `Error getting tenant attendance settings: ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get attendance settings",
    });
  }
};

export const updateTenantAttendanceSettings = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const {
    gracePeriodMinutes,
    earlyClockInMinutes,
    geofenceRadius,
    requirePhoto,
    allowedClockInMethods,
  } = req.body;

  try {
    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    // Build update data object (only include provided fields)
    const updateData = {};

    if (gracePeriodMinutes !== undefined) {
      if (gracePeriodMinutes < 0 || gracePeriodMinutes > 60) {
        return res.status(400).json({
          success: false,
          error: "Invalid grace period",
          message: "Grace period must be between 0 and 60 minutes",
        });
      }
      updateData.gracePeriodMinutes = gracePeriodMinutes;
    }

    if (earlyClockInMinutes !== undefined) {
      if (earlyClockInMinutes < 0 || earlyClockInMinutes > 240) {
        return res.status(400).json({
          success: false,
          error: "Invalid early clock-in minutes",
          message: "Early clock-in minutes must be between 0 and 240 minutes",
        });
      }
      updateData.earlyClockInMinutes = earlyClockInMinutes;
    }

    if (geofenceRadius !== undefined) {
      if (geofenceRadius < 10 || geofenceRadius > 10000) {
        return res.status(400).json({
          success: false,
          error: "Invalid geofence radius",
          message: "Geofence radius must be between 10 and 10000 meters",
        });
      }
      updateData.geofenceRadius = geofenceRadius;
    }

    if (requirePhoto !== undefined) {
      updateData.requirePhoto = Boolean(requirePhoto);
    }

    if (allowedClockInMethods !== undefined) {
      if (!Array.isArray(allowedClockInMethods)) {
        return res.status(400).json({
          success: false,
          error: "Invalid clock-in methods",
          message: "Allowed clock-in methods must be an array",
        });
      }

      const validMethods = ["GPS", "WIFI", "QR_CODE", "PHOTO"];
      const invalidMethods = allowedClockInMethods.filter(
        (method) => !validMethods.includes(method.toUpperCase())
      );

      if (invalidMethods.length > 0) {
        return res.status(400).json({
          success: false,
          error: "Invalid clock-in methods",
          message: `Invalid methods: ${invalidMethods.join(
            ", "
          )}. Valid methods are: ${validMethods.join(", ")}`,
        });
      }

      if (allowedClockInMethods.length > 2) {
        return res.status(400).json({
          success: false,
          error: "Too many clock-in methods",
          message: "At most 2 clock-in methods can be selected",
        });
      }

      updateData.allowedClockInMethods = allowedClockInMethods.map((method) =>
        method.toUpperCase()
      );
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
        message: "Please provide at least one field to update",
      });
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
      select: {
        id: true,
        name: true,
        code: true,
        gracePeriodMinutes: true,
        earlyClockInMinutes: true,
        geofenceRadius: true,
        requirePhoto: true,
        allowedClockInMethods: true,
      },
    });

    res.status(200).json({
      success: true,
      message: "Attendance settings updated successfully",
      data: updatedTenant,
    });
  } catch (error) {
    logger.error(
      `Error updating tenant attendance settings: ${error.message}`,
      {
        stack: error.stack,
      }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update attendance settings",
    });
  }
};

// ------------------------------------------------------------
// Tenant Locations (Attendance)
// ------------------------------------------------------------

export const getTenantLocations = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;

  try {
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    const locations = await prisma.location.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        wifiSSID: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: locations,
    });
  } catch (error) {
    logger.error(`Error getting tenant locations: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get locations",
    });
  }
};

export const createTenantLocation = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { name, latitude, longitude, wifiSSID, isActive } = req.body;

  try {
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return res.status(400).json({
        success: false,
        error: "Invalid name",
        message: "Location name is required",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        error: "Invalid latitude",
        message: "Latitude must be a number between -90 and 90",
      });
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        error: "Invalid longitude",
        message: "Longitude must be a number between -180 and 180",
      });
    }

    const trimmedWifi =
      wifiSSID === null || wifiSSID === undefined
        ? null
        : String(wifiSSID).trim();
    const normalizedWifi = trimmedWifi ? trimmedWifi : null;

    const isActiveVal = isActive === undefined ? true : Boolean(isActive);
    const created = await prisma.location.create({
      data: {
        tenantId,
        name: trimmedName,
        latitude: lat,
        longitude: lng,
        wifiSSID: normalizedWifi,
        isActive: isActiveVal,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        wifiSSID: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Location created successfully",
      data: created,
    });
  } catch (error) {
    logger.error(`Error creating tenant location: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create location",
    });
  }
};

export const updateTenantLocation = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const locationId = req.params.id;
  const { name, latitude, longitude, wifiSSID, isActive } = req.body;

  try {
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }
    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: "Location ID is required",
        message: "Location ID is required",
      });
    }

    const existing = await prisma.location.findUnique({
      where: { id: locationId },
      select: { id: true, tenantId: true },
    });
    if (!existing || existing.tenantId !== tenantId) {
      return res.status(404).json({
        success: false,
        error: "Location not found",
        message: "Location not found",
      });
    }

    const updateData = {};

    if (name !== undefined) {
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          error: "Invalid name",
          message: "Location name cannot be empty",
        });
      }
      updateData.name = trimmedName;
    }

    if (latitude !== undefined) {
      const lat = Number(latitude);
      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        return res.status(400).json({
          success: false,
          error: "Invalid latitude",
          message: "Latitude must be a number between -90 and 90",
        });
      }
      updateData.latitude = lat;
    }

    if (longitude !== undefined) {
      const lng = Number(longitude);
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        return res.status(400).json({
          success: false,
          error: "Invalid longitude",
          message: "Longitude must be a number between -180 and 180",
        });
      }
      updateData.longitude = lng;
    }

    if (wifiSSID !== undefined) {
      const trimmedWifi =
        wifiSSID === null ? null : String(wifiSSID).trim();
      updateData.wifiSSID = trimmedWifi ? trimmedWifi : null;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
        message: "Please provide at least one field to update",
      });
    }

    const updated = await prisma.location.update({
      where: { id: locationId },
      data: updateData,
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        wifiSSID: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Location updated successfully",
      data: updated,
    });
  } catch (error) {
    logger.error(`Error updating tenant location: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update location",
    });
  }
};

export const deleteTenantLocation = async (req, res) => {
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const locationId = req.params.id;

  try {
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }
    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: "Location ID is required",
        message: "Location ID is required",
      });
    }

    const deleted = await prisma.location.deleteMany({
      where: { id: locationId, tenantId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({
        success: false,
        error: "Location not found",
        message: "Location not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Location deleted successfully",
    });
  } catch (error) {
    logger.error(`Error deleting tenant location: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to delete location",
    });
  }
};

export const createAttendance = async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const { userId, locationId, clockInTime, clockOutTime, createdAt } =
      req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
        message: "User ID is required",
      });
    }

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: "Location ID is required",
        message: "Location ID is required",
      });
    }

    if (!createdAt) {
      return res.status(400).json({
        success: false,
        error: "createdAt is required",
        message: "createdAt is required",
      });
    }

    if (!clockInTime) {
      return res.status(400).json({
        success: false,
        error: "Clock in time is required",
        message: "Clock in time is required",
      });
    }

    const anchor = new Date(createdAt);
    if (Number.isNaN(anchor.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid createdAt",
        message: "createdAt must be a valid date",
      });
    }
    const y = anchor.getUTCFullYear();
    const mo = anchor.getUTCMonth();
    const day = anchor.getUTCDate();
    const dayStart = new Date(Date.UTC(y, mo, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, mo, day, 23, 59, 59, 999));

    const clockIn = new Date(clockInTime);
    if (Number.isNaN(clockIn.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid clockInTime",
        message: "clockInTime must be a valid date/time",
      });
    }

    let clockOut = null;
    if (clockOutTime) {
      clockOut = new Date(clockOutTime);
      if (Number.isNaN(clockOut.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid clockOutTime",
          message: "clockOutTime must be a valid date/time",
        });
      }
      if (clockOut <= clockIn) {
        return res.status(400).json({
          success: false,
          error: "Invalid clock-out time",
          message: "Clock-out time must be after clock-in time",
        });
      }
    }

    const clockInDeviceInfo = req.headers["user-agent"] || null;
    const clockInIpAddress =
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.connection?.remoteAddress ||
      null;

    const employee = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        shift: true,
        tenant: true,
      },
    });
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    if (employee.tenantId !== tenantId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Employee does not belong to this tenant",
      });
    }

    // Late/on-time/early uses clockIn only: shift start is parsed on the same
    // calendar day as clockIn (see parseTime in attendance.util.js), not createdAt.
    const status = employee.shift
      ? determineAttendanceStatus(
        clockIn,
        employee.shift,
        employee.tenant.gracePeriodMinutes ?? 5
      )
      : "ON_TIME";

    let totalHours = null;
    let overtimeHours = 0;
    if (clockOut) {
      if (employee.shift) {
        const hours = calculateHours(clockIn, clockOut, employee.shift);
        totalHours = hours.totalHours;
        overtimeHours = hours.overtimeHours;
      } else {
        const totalMilliseconds = clockOut - clockIn;
        totalHours =
          Math.round((totalMilliseconds / (1000 * 60 * 60)) * 100) / 100;
      }
    }

    const notes = "Manually clocked in by admin";

    const existing = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        clockInTime: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { clockInTime: "asc" },
    });

    const payload = {
      locationId,
      clockInTime: clockIn,
      clockOutTime: clockOut,
      status,
      clockInMethod: "MANUAL",
      clockInDeviceInfo,
      clockInIpAddress,
      totalHours,
      overtimeHours,
      notes,
    };

    let attendance;
    let message;

    if (existing) {
      attendance = await prisma.attendance.update({
        where: { id: existing.id },
        data: payload,
      });
      message = "Attendance updated successfully";
    } else {
      attendance = await prisma.attendance.create({
        data: {
          userId,
          tenantId,
          ...payload,
        },
      });
      message = "Attendance created successfully";
    }

    const afterSnapshot = {
      clockInTime: attendance.clockInTime,
      clockOutTime: attendance.clockOutTime,
      locationId: attendance.locationId,
      status: attendance.status,
      totalHours: attendance.totalHours,
      overtimeHours: attendance.overtimeHours,
    };
    if (existing) {
      const beforeSnapshot = {
        clockInTime: existing.clockInTime,
        clockOutTime: existing.clockOutTime,
        locationId: existing.locationId,
        status: existing.status,
        totalHours: existing.totalHours,
        overtimeHours: existing.overtimeHours,
      };
      const changes = getChangesDiff(beforeSnapshot, afterSnapshot);
      await addLog(
        req.user.id,
        tenantId,
        "UPDATE",
        "Attendance",
        attendance.id,
        changes || { message, employeeUserId: userId },
        req
      );
    } else {
      await addLog(
        req.user.id,
        tenantId,
        "CREATE",
        "Attendance",
        attendance.id,
        { ...afterSnapshot, employeeUserId: userId, message },
        req
      );
    }

    res.status(200).json({
      success: true,
      message,
      data: attendance,
    });
  } catch (error) {
    logger.error(`Error creating attendance: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to save attendance",
    });
  }
};

export const adminClockInToday = async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const userId = req.params.userId;
    const { locationId, clockInTime, reason } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
        message: "User ID is required",
      });
    }

    if (!locationId) {
      return res.status(400).json({
        success: false,
        error: "Location ID is required",
        message: "Location ID is required",
      });
    }

    if (!clockInTime) {
      return res.status(400).json({
        success: false,
        error: "Clock in time is required",
        message: "Clock in time is required",
      });
    }

    const clockIn = new Date(clockInTime);
    if (Number.isNaN(clockIn.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid clockInTime",
        message: "clockInTime must be a valid date/time",
      });
    }

    const now = new Date();
    const y = now.getUTCFullYear();
    const mo = now.getUTCMonth();
    const day = now.getUTCDate();
    const dayStart = new Date(Date.UTC(y, mo, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, mo, day, 23, 59, 59, 999));

    const clockInDeviceInfo = req.headers["user-agent"] || null;
    const clockInIpAddress =
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.connection?.remoteAddress ||
      null;

    const employee = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        shift: true,
        tenant: true,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
        message: "Employee not found",
      });
    }

    if (employee.tenantId !== tenantId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Employee does not belong to this tenant",
      });
    }

    const existing = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        clockInTime: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { clockInTime: "asc" },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Attendance already exists",
        message: "This employee already has attendance recorded for today",
      });
    }

    // Shift start anchored to clockIn's calendar day (parseTime in attendance.util.js).
    const status = employee.shift
      ? determineAttendanceStatus(
        clockIn,
        employee.shift,
        employee.tenant.gracePeriodMinutes ?? 5
      )
      : "ON_TIME";

    const normalizedReason =
      typeof reason === "string" && reason.trim() ? reason.trim() : null;
    const manualClockInNote = normalizedReason
      ? `Manually clocked in by admin (today) - ${normalizedReason}`
      : "Manually clocked in by admin (today)";

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        locationId,
        clockInTime: clockIn,
        clockOutTime: null,
        status,
        clockInMethod: "MANUAL",
        clockInDeviceInfo,
        clockInIpAddress,
        totalHours: null,
        overtimeHours: 0,
        notes: manualClockInNote,
      },
    });

    await addLog(
      req.user.id,
      tenantId,
      "CREATE",
      "Attendance",
      attendance.id,
      {
        employeeUserId: userId,
        clockInTime: attendance.clockInTime,
        locationId: attendance.locationId,
        reason: normalizedReason,
        message: "Admin clock-in today for employee",
      },
      req
    );

    return res.status(200).json({
      success: true,
      message: "Attendance recorded for today",
      data: attendance,
    });
  } catch (error) {
    logger.error(`Error in adminClockInToday: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to record attendance",
    });
  }
};

export const adminClockOutToday = async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const userId = req.params.userId;
    const { clockOutTime, reason } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
        message: "User ID is required",
      });
    }

    if (!clockOutTime) {
      return res.status(400).json({
        success: false,
        error: "Clock out time is required",
        message: "Clock out time is required",
      });
    }

    const outTime = new Date(clockOutTime);
    if (Number.isNaN(outTime.getTime())) {
      return res.status(400).json({
        success: false,
        error: "Invalid clockOutTime",
        message: "clockOutTime must be a valid date/time",
      });
    }

    const now = new Date();
    const y = now.getUTCFullYear();
    const mo = now.getUTCMonth();
    const day = now.getUTCDate();
    const dayStart = new Date(Date.UTC(y, mo, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(y, mo, day, 23, 59, 59, 999));

    const attendance = await prisma.attendance.findFirst({
      where: {
        userId,
        tenantId,
        clockInTime: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { clockInTime: "asc" },
      include: {
        user: {
          include: {
            shift: true,
          },
        },
      },
    });

    if (!attendance) {
      return res.status(404).json({
        success: false,
        error: "Attendance not found",
        message: "No clock-in for this employee today; clock-in before clock-out",
      });
    }

    if (attendance.clockOutTime) {
      return res.status(400).json({
        success: false,
        error: "Already clocked out",
        message: "This employee is already clocked out for today",
      });
    }

    if (outTime <= attendance.clockInTime) {
      return res.status(400).json({
        success: false,
        error: "Invalid clock-out time",
        message: "Clock-out time must be after clock-in time",
      });
    }

    let totalHours = null;
    let overtimeHours = 0;
    if (attendance.user.shift) {
      const hours = calculateHours(
        attendance.clockInTime,
        outTime,
        attendance.user.shift
      );
      totalHours = hours.totalHours;
      overtimeHours = hours.overtimeHours;
    } else {
      const totalMilliseconds = outTime - attendance.clockInTime;
      totalHours =
        Math.round((totalMilliseconds / (1000 * 60 * 60)) * 100) / 100;
    }

    const normalizedReason =
      typeof reason === "string" && reason.trim() ? reason.trim() : null;
    const manualClockOutNote = normalizedReason
      ? `Manually clocked out by admin (today) - ${normalizedReason}`
      : "Manually clocked out by admin (today)";
    const notes = attendance.notes
      ? `${attendance.notes} | ${manualClockOutNote}`
      : manualClockOutNote;

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        clockOutTime: outTime,
        clockOutMethod: "MANUAL",
        totalHours,
        overtimeHours,
        notes,
      },
    });

    await addLog(
      req.user.id,
      tenantId,
      "UPDATE",
      "Attendance",
      updatedAttendance.id,
      {
        employeeUserId: userId,
        clockOutTime: outTime.toISOString(),
        totalHours,
        overtimeHours,
        reason: normalizedReason,
        message: "Admin clock-out today for employee",
      },
      req
    );

    return res.status(200).json({
      success: true,
      message: "Employee clocked out successfully",
      data: updatedAttendance,
    });
  } catch (error) {
    logger.error(`Error in adminClockOutToday: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to clock out employee",
    });
  }
};

export const adminUpdateAttendanceRecord = async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const attendanceId = req.params.attendanceId;
    const { clockInTime, clockOutTime, locationId } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Tenant ID is required",
        message: "Tenant ID is required",
      });
    }

    if (!attendanceId) {
      return res.status(400).json({
        success: false,
        error: "Attendance ID is required",
        message: "Attendance ID is required",
      });
    }

    const hasClockIn = clockInTime !== undefined;
    const hasClockOut = clockOutTime !== undefined;
    const hasLocation = locationId !== undefined;

    if (!hasClockIn && !hasClockOut && !hasLocation) {
      return res.status(400).json({
        success: false,
        error: "No fields to update",
        message:
          "Provide at least one of clockInTime, clockOutTime, or locationId",
      });
    }

    const existing = await prisma.attendance.findFirst({
      where: { id: attendanceId, tenantId },
      include: {
        user: {
          include: {
            shift: true,
            tenant: true,
          },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Attendance not found",
        message:
          "Attendance record not found or does not belong to this tenant",
      });
    }

    let nextClockIn = existing.clockInTime;
    if (hasClockIn) {
      const parsed = new Date(clockInTime);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid clockInTime",
          message: "clockInTime must be a valid date/time",
        });
      }
      nextClockIn = parsed;
    }

    let nextClockOut = existing.clockOutTime;
    if (hasClockOut) {
      if (clockOutTime === null || clockOutTime === "") {
        nextClockOut = null;
      } else {
        const parsed = new Date(clockOutTime);
        if (Number.isNaN(parsed.getTime())) {
          return res.status(400).json({
            success: false,
            error: "Invalid clockOutTime",
            message: "clockOutTime must be a valid date/time",
          });
        }
        nextClockOut = parsed;
      }
    }

    if (nextClockOut && nextClockOut <= nextClockIn) {
      return res.status(400).json({
        success: false,
        error: "Invalid times",
        message: "Clock-out time must be after clock-in time",
      });
    }

    let nextLocationId = existing.locationId;
    if (hasLocation) {
      if (locationId === null || locationId === "" || locationId === "none") {
        nextLocationId = null;
      } else {
        const loc = await prisma.location.findFirst({
          where: { id: locationId, tenantId },
        });
        if (!loc) {
          return res.status(400).json({
            success: false,
            error: "Invalid location",
            message: "Location not found for this tenant",
          });
        }
        nextLocationId = locationId;
      }
    }

    const shift = existing.user.shift;
    const tenantUser = existing.user.tenant;
    const timesChanged = hasClockIn || hasClockOut;

    let status = existing.status;
    let totalHours = existing.totalHours;
    let overtimeHours = existing.overtimeHours ?? 0;

    if (timesChanged) {
      // Same rule as manual create: status from nextClockIn vs shift start on that clock-in day.
      status = shift
        ? determineAttendanceStatus(
          nextClockIn,
          shift,
          tenantUser.gracePeriodMinutes ?? 5
        )
        : "ON_TIME";
      if (nextClockOut) {
        if (shift) {
          const hours = calculateHours(nextClockIn, nextClockOut, shift);
          totalHours = hours.totalHours;
          overtimeHours = hours.overtimeHours;
        } else {
          const totalMilliseconds = nextClockOut - nextClockIn;
          totalHours =
            Math.round((totalMilliseconds / (1000 * 60 * 60)) * 100) / 100;
          overtimeHours = 0;
        }
      } else {
        totalHours = null;
        overtimeHours = 0;
      }
    }

    const beforeSnapshot = {
      clockInTime: existing.clockInTime,
      clockOutTime: existing.clockOutTime,
      locationId: existing.locationId,
      status: existing.status,
      totalHours: existing.totalHours,
      overtimeHours: existing.overtimeHours,
    };

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        clockInTime: nextClockIn,
        clockOutTime: nextClockOut,
        locationId: nextLocationId,
        status,
        totalHours,
        overtimeHours,
      },
    });

    const afterSnapshot = {
      clockInTime: updatedAttendance.clockInTime,
      clockOutTime: updatedAttendance.clockOutTime,
      locationId: updatedAttendance.locationId,
      status: updatedAttendance.status,
      totalHours: updatedAttendance.totalHours,
      overtimeHours: updatedAttendance.overtimeHours,
    };
    const changes = getChangesDiff(beforeSnapshot, afterSnapshot);
    await addLog(
      req.user.id,
      tenantId,
      "UPDATE",
      "Attendance",
      attendanceId,
      changes || {
        message: "Admin updated attendance record",
        employeeUserId: existing.userId,
      },
      req
    );

    return res.status(200).json({
      success: true,
      message: "Attendance record updated successfully",
      data: updatedAttendance,
    });
  } catch (error) {
    logger.error(`Error in adminUpdateAttendanceRecord: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update attendance record",
    });
  }
};
