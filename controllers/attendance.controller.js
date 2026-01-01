import prisma from "../config/prisma.config.js";
import {
  ClockInWindow,
  determineAttendanceStatus,
  verifyQRPayload,
  withInLocationRange,
  isSameWifi,
  handlePhotoUpload,
} from "../utils/attendance.util.js";
import logger from "../utils/logger.js";

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

    // Handle photo upload if required or provided
    let clockOutPhotoUrl = null;
    if (employee.tenant.requirePhoto || req.file || req.body.photoUrl) {
      clockOutPhotoUrl = await handlePhotoUpload(
        req,
        userId,
        tenantId,
        "clock-out"
      );

      if (employee.tenant.requirePhoto && !clockOutPhotoUrl) {
        logger.error("Photo is required but not provided");
        return res.status(400).json({
          success: false,
          error: "Photo is required",
          message: "Photo verification is mandatory for clock-out",
        });
      }
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceRecord.id },
      data: {
        clockOutTime: now,
        clockOutMethod: "GPS",
        clockOutDeviceInfo,
        clockOutIpAddress,
        clockOutPhotoUrl,
      },
    });

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

    // Handle photo upload if required or provided
    let clockOutPhotoUrl = null;
    if (employee.tenant.requirePhoto || req.file || req.body.photoUrl) {
      clockOutPhotoUrl = await handlePhotoUpload(
        req,
        userId,
        tenantId,
        "clock-out"
      );

      if (employee.tenant.requirePhoto && !clockOutPhotoUrl) {
        logger.error("Photo is required but not provided");
        return res.status(400).json({
          success: false,
          error: "Photo is required",
          message: "Photo verification is mandatory for clock-out",
        });
      }
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceRecord.id },
      data: {
        clockOutTime: now,
        clockOutMethod: "WIFI",
        clockOutDeviceInfo,
        clockOutIpAddress,
        clockOutPhotoUrl,
      },
    });

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

    // Handle photo upload if required or provided
    let clockOutPhotoUrl = null;
    if (employee.tenant.requirePhoto || req.file || req.body.photoUrl) {
      clockOutPhotoUrl = await handlePhotoUpload(
        req,
        userId,
        tenantId,
        "clock-out"
      );

      if (employee.tenant.requirePhoto && !clockOutPhotoUrl) {
        logger.error("Photo is required but not provided");
        return res.status(400).json({
          success: false,
          error: "Photo is required",
          message: "Photo verification is mandatory for clock-out",
        });
      }
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceRecord.id },
      data: {
        clockOutTime: now,
        clockOutMethod: "QR CODE",
        clockOutDeviceInfo,
        clockOutIpAddress,
        clockOutPhotoUrl,
      },
    });

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
          status: true,
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
