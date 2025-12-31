import prisma from "../config/prisma.config.js";
import {
  ClockInWindow,
  determineAttendanceStatus,
  verifyQRPayload,
  withInLocationRange,
} from "../utils/attendance.util.js";
import logger from "../utils/logger.js";

// Clock-In Controllers
export const clockInGPS = async (req, res) => {
  const userId = req.user.id;
  const tenantId = req.user.tenantId;
  const { latitude, longitude } = req.body;
  clockInDeviceInfo = req.headers["user-agent"] || null;
  clockInIpAddress =
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

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        locationId: isWithinLocationRange.location.id,
        clockInTime: now,
        status: attendanceStatus,
        clockInMethod: "GPS",
        clockInPhotoUrl: null,
        clockInDeviceInfo,
        clockInIpAddress,
      },
    });

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
  clockInDeviceInfo = req.headers["user-agent"] || null;
  clockInIpAddress =
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

    const isSameWifi = await isSameWifi(wifiSSID, employee.tenant.location);

    if (!isSameWifi.valid) {
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

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        locationId: isSameWifi.location.id,
        clockInTime: now,
        status: attendanceStatus,
        clockInMethod: "WIFI",
        clockInPhotoUrl: null,
        clockInDeviceInfo,
        clockInIpAddress,
      },
    });

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
  clockInDeviceInfo = req.headers["user-agent"] || null;
  clockInIpAddress =
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

    const isQRPayloadValid = await verifyQRPayload(qrPayload);

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

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        tenantId,
        locationId: isWithinLocationRange.location.id,
        clockInTime: now,
        status: attendanceStatus,
        clockInMethod: "QR CODE",
        clockInPhotoUrl: null,
        clockInDeviceInfo,
        clockInIpAddress,
      },
    });

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

export const clockInPhoto = (req, res) => {};

// Clock-Out Controllers
export const clockOutGPS = (req, res) => {};

export const clockOutWiFi = (req, res) => {};

export const clockOutQRCode = (req, res) => {};

export const clockOutPhoto = (req, res) => {};

// Attendance History
export const getAttendanceHistory = (req, res) => {};

export const getMyAttendanceHistory = (req, res) => {};
