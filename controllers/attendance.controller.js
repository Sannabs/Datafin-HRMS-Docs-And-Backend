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

// Clock-In Controllers
export const clockInGPS = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.user.tenantId;
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
      employee.tenant.gracePeriod
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
  const tenantId = req.user.tenantId;
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
      employee.tenant.gracePeriod
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
  const tenantId = req.user.tenantId;
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
      employee.tenant.gracePeriod
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
  const tenantId = req.user.tenantId;
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
  const tenantId = req.user.tenantId;
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
  const tenantId = req.user.tenantId;
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
  const { tenantId } = req.user;

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
      clockInMethod,
      clockOutMethod,
      userId,
      startDate,
      endDate,
      search,
      sortBy,
      sortOrder,
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

    // Filter by clock in method
    if (clockInMethod) {
      const validMethods = ["GPS", "WIFI", "QR CODE", "PHOTO"];
      if (validMethods.includes(clockInMethod.toUpperCase())) {
        where.clockInMethod = clockInMethod.toUpperCase();
      }
    }

    // Filter by clock out method
    if (clockOutMethod) {
      const validMethods = ["GPS", "WIFI", "QR CODE", "PHOTO"];
      if (validMethods.includes(clockOutMethod.toUpperCase())) {
        where.clockOutMethod = clockOutMethod.toUpperCase();
      }
    }

    // Date range filtering
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

    // Search functionality
    if (search) {
      const searchTerm = search.trim();
      where.OR = [
        { status: { contains: searchTerm, mode: "insensitive" } },
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

    // Sorting
    const validSortFields = [
      "clockInTime",
      "clockOutTime",
      "status",
      "createdAt",
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "clockInTime";
    const order = sortOrder?.toLowerCase() === "asc" ? "asc" : "desc";

    const orderBy = {
      [sortField]: order,
    };

    // Execute queries
    const [attendance, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
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
  const tenantId = req.user.tenantId;

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
  const tenantId = req.user.tenantId;

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
  const tenantId = req.user.tenantId;

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
  const tenantId = req.user.tenantId;
  const { clockOutTime } = req.body;

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

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        clockOutTime: outTime,
        clockOutMethod: "MANUAL",
        totalHours,
        overtimeHours,
        notes: attendance.notes
          ? `${attendance.notes} | Manually clocked out by admin`
          : "Manually clocked out by admin",
      },
    });

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
  const tenantId = req.user.tenantId;
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
  const tenantId = req.user.tenantId;
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

export const getEmployeeWorkConfigs = async (req, res) => {
  const tenantId = req.user.tenantId;

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
    const limit = Math.min(parseInt(req.query.limit || 20), 100);
    const skip = (page - 1) * limit;

    const { userId } = req.query;

    // Get user IDs for this tenant
    const userWhere = { tenantId };
    if (userId) {
      userWhere.id = userId;
    }

    const tenantUsers = await prisma.user.findMany({
      where: userWhere,
      select: { id: true },
    });

    const userIds = tenantUsers.map((u) => u.id);

    if (userIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Employee work configurations retrieved successfully",
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

    const where = {
      userId: {
        in: userIds,
      },
    };

    const [workConfigs, total] = await Promise.all([
      prisma.employeeWorkConfig.findMany({
        where,
        skip,
        take: limit,
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
        orderBy: { updatedAt: "desc" },
      }),
      prisma.employeeWorkConfig.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: "Employee work configurations retrieved successfully",
      data: workConfigs,
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
    logger.error(`Error getting employee work configs: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get employee work configurations",
    });
  }
};

// Company Work Day Controllers
export const createOrUpdateCompanyWorkDay = async (req, res) => {
  const tenantId = req.user.tenantId;
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
  const tenantId = req.user.tenantId;

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
  const tenantId = req.user.tenantId;

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
  const tenantId = req.user.tenantId;
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
