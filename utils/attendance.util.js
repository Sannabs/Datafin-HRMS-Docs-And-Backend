// Calculating distance between two coordinates using Haversine formula

import { uploadFile } from "../config/storage.config.js";
import logger from "./logger.js";
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

// function to check if the employee is within the location range
export const withInLocationRange = (
  employeeLat,
  employeeLon,
  locationOrLocations,
  geofenceRadius
) => {
  const noLocations =
    !locationOrLocations ||
    (Array.isArray(locationOrLocations) && locationOrLocations.length === 0);
  if (noLocations) {
    return {
      valid: false,
      message: "No configured locations found",
      location: null,
    };
  }

  if (!Array.isArray(locationOrLocations)) {
    const location = locationOrLocations;

    const distance = calculateDistance(
      employeeLat,
      employeeLon,
      location.latitude,
      location.longitude
    );

    if (distance <= geofenceRadius) {
      return {
        valid: true,
        message: "Employee is within the location range",
        location: location,
        distance: Math.round(distance),
      };
    }

    return {
      valid: false,
      message: "Not within allowed company locations",
      location: null,
    };
  }

  for (const location of locationOrLocations) {
    const distance = calculateDistance(
      employeeLat,
      employeeLon,
      location.latitude,
      location.longitude
    );

    if (distance <= geofenceRadius) {
      return {
        valid: true,
        message: "Employee is within the location range",
        location: location,
        distance: Math.round(distance),
      };
    }
  }

  // If no location is within range, return false
  return {
    valid: false,
    message: "Not within allowed company locations",
    location: null,
  };
};

// Attendance Status determinant
// gracePeriodMinutes: minutes after shift start still counted as on-time (from tenant)
export const determineAttendanceStatus = (
  clockInTime,
  shift,
  gracePeriodMinutes
) => {
  const gp =
    gracePeriodMinutes == null || Number.isNaN(Number(gracePeriodMinutes))
      ? 5
      : Number(gracePeriodMinutes);
  const shiftStart = parseTime(shift.startTime, clockInTime);
  const diffMinutes = (clockInTime - shiftStart) / 60000;

  if (diffMinutes < -15) {
    return "EARLY";
  }

  if (diffMinutes <= gp) {
    return "ON_TIME";
  }

  return "LATE";
};

/**
 * Parse "HH:mm" onto the calendar day of referenceDate (same instant's local date).
 * Used so shift start/end align with the clock-in/out day, not "today" on the server.
 */
export function parseTime(timeStr, referenceDate = new Date()) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const d = new Date(referenceDate);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// function to determine if the employee is within the clock-in window
export const ClockInWindow = (shift, earlyClockInMinutes, currentTime) => {
  const shiftStart = parseTime(shift.startTime, currentTime);
  const earliestAllowed = shiftStart - earlyClockInMinutes * 60000;

  if (currentTime < earliestAllowed) {
    return {
      valid: false,
      message: "Clock-in too early",
      windowStart: earliestAllowed,
    };
  }

  return {
    valid: true,
    message: "Within clock-in window",
    windowStart: earliestAllowed,
  };
};

/** `windowStart` from ClockInWindow is a UTC ms timestamp — format for user-facing messages. */
export function formatClockInEarliestTime(windowStart) {
  if (windowStart == null) return "";
  const d =
    windowStart instanceof Date ? windowStart : new Date(windowStart);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export const isSameWifi = async (wifiSSID, locationOrLocations) => {
  const noLocations =
    !locationOrLocations ||
    (Array.isArray(locationOrLocations) && locationOrLocations.length === 0);
  if (noLocations) {
    return {
      valid: false,
      message: "No Wi-Fi locations configured",
    };
  }
  if (!wifiSSID) {
    return {
      valid: false,
      message: "No WifiSSd Matched Yours",
    };
  }

  if (!Array.isArray(locationOrLocations)) {
    const location = locationOrLocations;

    if (location.wifiSSID === wifiSSID) {
      return {
        valid: true,
        message: "WifiSSd Matched Yours",
        location: location,
      };
    }
  }

  for (const location of locationOrLocations) {
    if (location.wifiSSID === wifiSSID) {
      return {
        valid: true,
        message: "WifiSSd Matched Yours",
        location: location,
      };
    }
  }

  return {
    valid: false,
    message: "No WifiSSd Matched Yours",
  };
};

export const verifyQRPayload = (qrPayload) => {
  if (!qrPayload) {
    return {
      valid: false,
      message: "No QR Payload Provided",
    };
  }
  if (
    typeof qrPayload === "string" &&
    qrPayload === process.env.QR_PAYLOAD_SECRET
  ) {
    return {
      valid: true,
      message: "QR Payload Verified",
      qrPayload: qrPayload,
    };
  }

  return {
    valid: false,
    message: "Invalid QR Payload",
  };
};

// Helper function to handle photo upload during clock in and clock out
export const handlePhotoUpload = async (
  req,
  userId,
  tenantId,
  type = "clock-in"
) => {
  let photoUrl = null;

  // Check if photo is uploaded via multer
  if (req.file) {
    try {
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 15);
      const extension = req.file.originalname.split(".").pop();
      const filename = `attendance/${tenantId}/${userId}/${type}/${timestamp}-${randomString}.${extension}`;

      photoUrl = await uploadFile(req.file.buffer, filename, req.file.mimetype);
    } catch (error) {
      logger.error(`Error uploading photo: ${error.message}`);
      throw new Error("Failed to upload photo");
    }
  } else if (req.body.photoUrl) {
    // Allow photo URL to be passed directly (if already uploaded)
    photoUrl = req.body.photoUrl;
  }

  return photoUrl;
};

export const calculateHours = (clockInTime, clockOutTime, shift) => {
  if (!clockInTime || !clockOutTime || !shift) {
    return { totalHours: null, overtimeHours: 0 };
  }

  // Calculate total hours worked (actual clock-in to clock-out)
  const totalMilliseconds = clockOutTime - clockInTime;
  const totalHours = totalMilliseconds / (1000 * 60 * 60); // Convert to hours

  // Parse shift times on the same calendar day as clock-in
  const shiftStart = parseTime(shift.startTime, clockInTime);
  const shiftEnd = parseTime(shift.endTime, clockInTime);

  // Handle night shift (crosses midnight)
  // If endTime < startTime, shift crosses midnight
  if (shiftEnd < shiftStart) {
    // For night shift, shiftEnd is next day
    const nextDayShiftEnd = new Date(shiftEnd);
    nextDayShiftEnd.setDate(nextDayShiftEnd.getDate() + 1);

    // Calculate regular shift duration (in hours)
    const regularHours = (nextDayShiftEnd - shiftStart) / (1000 * 60 * 60);

    // Calculate overtime
    // Overtime = time worked beyond shift end
    // If clock-out is after shift end, calculate overtime
    let overtimeHours = 0;
    if (clockOutTime > nextDayShiftEnd) {
      const overtimeMilliseconds = clockOutTime - nextDayShiftEnd;
      overtimeHours = overtimeMilliseconds / (1000 * 60 * 60);
    }

    return {
      totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
      overtimeHours: Math.round(overtimeHours * 100) / 100,
    };
  }

  // Normal shift (same day)
  // Calculate regular shift duration (in hours)
  const regularHours = (shiftEnd - shiftStart) / (1000 * 60 * 60);

  // Calculate overtime
  // Overtime = time worked beyond shift end time
  // Only count if clock-out is after shift end
  let overtimeHours = 0;
  if (clockOutTime > shiftEnd) {
    const overtimeMilliseconds = clockOutTime - shiftEnd;
    overtimeHours = overtimeMilliseconds / (1000 * 60 * 60);
  }

  return {
    totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
    overtimeHours: Math.round(overtimeHours * 100) / 100,
  };
};

/**
 * Get shift end time as Date object
 * @param {Object} shift - Shift object with startTime and endTime
 * @param {Date} clockInDate - Date of clock-in
 * @returns {Date} Shift end time as Date
 */
export const getShiftEndTime = (shift, clockInDate) => {
  const shiftStart = parseTime(shift.startTime, clockInDate);
  const shiftEnd = parseTime(shift.endTime, clockInDate);

  // Handle night shift (crosses midnight)
  if (shiftEnd < shiftStart) {
    // Shift ends next day
    const endTime = new Date(clockInDate);
    const [endHour, endMin] = shift.endTime.split(":").map(Number);
    endTime.setDate(endTime.getDate() + 1);
    endTime.setHours(endHour, endMin, 0, 0);
    return endTime;
  }

  // Normal shift (same day)
  const endTime = new Date(clockInDate);
  const [endHour, endMin] = shift.endTime.split(":").map(Number);
  endTime.setHours(endHour, endMin, 0, 0);
  return endTime;
};

export const validateTimeFormat = (timeString) => {
  if (!timeString || typeof timeString !== "string") {
    throw new Error("Time must be a non-empty string");
  }

  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:([0-5][0-9]))?$/;

  if (!timeRegex.test(timeString)) {
    throw new Error(
      `Invalid time format: "${timeString}". Expected format: HH:MM or HH:MM:SS (e.g., "09:00" or "09:00:00")`
    );
  }

  return true;
};

export const normalizeTimeFormat = (timeString) => {
  validateTimeFormat(timeString);

  if (timeString.includes(":") && timeString.split(":").length === 3) {
    return timeString.split(":").slice(0, 2).join(":");
  }

  return timeString;
};

/**
 * One attendance row per user per calendar day (server local date of referenceDate).
 * Use before creating a new clock-in record.
 */
export async function assertCanClockInToday(
  prisma,
  userId,
  tenantId,
  referenceDate = new Date()
) {
  const startOfDay = new Date(referenceDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(referenceDate);
  endOfDay.setHours(23, 59, 59, 999);

  const existingToday = await prisma.attendance.findFirst({
    where: {
      userId,
      tenantId,
      clockInTime: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { clockInTime: "desc" },
    select: { id: true, clockOutTime: true },
  });

  if (!existingToday) {
    return { ok: true };
  }
  if (existingToday.clockOutTime == null) {
    return {
      ok: false,
      error: "Already clocked in",
      message:
        "You are already clocked in today. Please clock out before starting a new session.",
    };
  }
  return {
    ok: false,
    error: "Attendance already completed today",
    message: "You have already clocked in and out today.",
  };
}
