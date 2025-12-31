// Calculating distance between two coordinates using Haversine formula

import { Locator } from "puppeteer";

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
  if (!locationOrLocations || locationOrLocations.length === 0) {
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
export const determineAttendanceStatus = (clockInTime, shift, gracePeriod) => {
  const shiftStart = parseTime(shift.startTime);
  const diffMinutes = (clockInTime - shiftStart) / 60000;

  if (diffMinutes < -15) {
    return "EARLY";
  }

  if (diffMinutes <= gracePeriod) {
    return "ON_TIME";
  }

  return "LATE";
};

// helper function to parse time string to Date object
function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const now = new Date();
  now.setHours(hours, minutes, 0, 0);
  return now;
}

// function to determine if the employee is within the clock-in window
export const ClockInWindow = (shift, earlyClockInMinutes, currentTime) => {
  const shiftStart = parseTime(shift.startTime);
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

export const isSameWifi = async (wifiSSID, locationOrLocations) => {
  if (!wifiSSID || !locationOrLocations || locationOrLocations.length === 0) {
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
