// Calculating distance between two coordinates using Haversine formula

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
      success: false,
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

    return {
      valid: false,
      message: "Not within allowed company locations",
      location: null,
    };
  }
};

// Attendance Status util
export const determineAttendanceStatus = () => {};
