# Attendance API Documentation

## Base Endpoint

```
/api/v1/attendance
```

All endpoints require authentication via JWT token in the Authorization header.

---

## Overview

The Attendance API provides endpoints for clocking in/out using multiple verification methods (GPS, WiFi, QR Code) with optional photo verification. Photo verification can be mandatory or optional based on company settings.

### Key Features

- **Multiple Clock-In Methods**: GPS, WiFi, QR Code
- **Photo Verification**: Optional additional layer for accountability
- **Location Verification**: Geofencing for GPS and QR Code methods
- **Attendance History**: Admin and employee-specific views
- **Late Reason**: Add notes for late or absent attendance

---

## Utility Functions

The attendance system uses utility functions from `utils/attendance.util.js`:

- `calculateDistance()` - Haversine formula for distance calculation
- `withInLocationRange()` - Validates employee is within geofence radius
- `determineAttendanceStatus()` - Calculates ON_TIME, LATE, or EARLY status
- `ClockInWindow()` - Validates clock-in is within allowed time window
- `isSameWifi()` - Verifies WiFi SSID matches company location
- `verifyQRPayload()` - Validates QR code payload against secret
- `handlePhotoUpload()` - Handles photo upload to R2 storage
- `calculateHours()` - Calculates total hours worked and overtime hours

---

## Clock-In Endpoints

### Clock In with GPS

**POST** `/api/v1/attendance/clock-in/gps`

Clock in using GPS location verification. Employee must be within the configured geofence radius.

**Request Body:**

```json
{
  "latitude": 6.5244,
  "longitude": 3.3792,
  "photoUrl": "https://..." // Optional: pre-uploaded photo URL
}
```

**Form Data (Alternative):**

- `image` (file): Photo file (optional, max 5MB)
- `latitude` (number): Required
- `longitude` (number): Required

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Clock in successful - ON_TIME",
  "data": {
    "id": "att_123",
    "userId": "user_456",
    "tenantId": "tenant_789",
    "locationId": "loc_101",
    "clockInTime": "2025-01-15T09:03:00Z",
    "status": "ON_TIME",
    "clockInMethod": "GPS",
    "clockInPhotoUrl": "https://...",
    "clockInDeviceInfo": "iPhone 14",
    "clockInIpAddress": "192.168.1.100"
  }
}
```

**Error Responses:**

- `400` - Missing coordinates, not in location range, too early to clock in
- `404` - Employee not found
- `500` - Server error

---

### Clock In with WiFi

**POST** `/api/v1/attendance/clock-in/wifi`

Clock in using WiFi network verification. Employee must be connected to a configured company WiFi network.

**Request Body:**

```json
{
  "wifiSSID": "CompanyWiFi_5G",
  "photoUrl": "https://..." // Optional
}
```

**Form Data (Alternative):**

- `image` (file): Photo file (optional)
- `wifiSSID` (string): Required

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Clock in successful - ON_TIME",
  "data": {
    "id": "att_123",
    "clockInMethod": "WIFI",
    "clockInPhotoUrl": "https://...",
    ...
  }
}
```

**Error Responses:**

- `400` - Missing WiFi SSID, not connected to company WiFi, too early to clock in
- `404` - Employee not found
- `500` - Server error

---

### Clock In with QR Code

**POST** `/api/v1/attendance/clock-in/qrcode`

Clock in by scanning a QR code. Requires location coordinates for geofence verification.

**Request Body:**

```json
{
  "qrPayload": "company_secret_token",
  "latitude": 6.5244,
  "longitude": 3.3792,
  "photoUrl": "https://..." // Optional
}
```

**Form Data (Alternative):**

- `image` (file): Photo file (optional)
- `qrPayload` (string): Required
- `latitude` (number): Required
- `longitude` (number): Required

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Clock in successful - ON_TIME",
  "data": {
    "id": "att_123",
    "clockInMethod": "QR CODE",
    "clockInPhotoUrl": "https://...",
    ...
  }
}
```

**Error Responses:**

- `400` - Missing QR payload/coordinates, invalid QR payload, not in location range
- `404` - Employee not found
- `500` - Server error

---

## Clock-Out Endpoints

### Clock Out with GPS

**POST** `/api/v1/attendance/clock-out/gps`

Clock out using GPS location verification. Requires an existing clock-in record for today.

**Request Body:**

```json
{
  "latitude": 6.5244,
  "longitude": 3.3792,
  "photoUrl": "https://..." // Optional
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Clock out successful - ON_TIME",
  "data": {
    "id": "att_123",
    "clockOutTime": "2025-01-15T17:30:00Z",
    "clockOutMethod": "GPS",
    "clockOutPhotoUrl": "https://...",
    "totalHours": 8.5,
    "overtimeHours": 0.5,
    "status": "ON_TIME"
  }
}
```

**Note:** `totalHours` and `overtimeHours` are automatically calculated on clock-out. Overtime is only calculated if clock-out time is after shift end time.

**Error Responses:**

- `400` - Missing coordinates, not in location range
- `404` - No attendance record found for today
- `500` - Server error

---

### Clock Out with WiFi

**POST** `/api/v1/attendance/clock-out/wifi`

Clock out using WiFi network verification.

**Request Body:**

```json
{
  "wifiSSID": "CompanyWiFi_5G",
  "photoUrl": "https://..." // Optional
}
```

**Response:** `200 OK` (Same structure as GPS clock-out)

---

### Clock Out with QR Code

**POST** `/api/v1/attendance/clock-out/qrcode`

Clock out by scanning a QR code.

**Request Body:**

```json
{
  "qrPayload": "company_secret_token",
  "latitude": 6.5244,
  "longitude": 3.3792,
  "photoUrl": "https://..." // Optional
}
```

**Response:** `200 OK` (Same structure as GPS clock-out)

---

## Attendance History Endpoints

### Get Attendance History (Admin)

**GET** `/api/v1/attendance/history`

Retrieve attendance records for all employees (admin view). Supports filtering, searching, and pagination.

**Query Parameters:**

| Parameter        | Type    | Description                                                      |
| ---------------- | ------- | ---------------------------------------------------------------- |
| `page`           | integer | Page number (default: 1)                                         |
| `limit`          | integer | Items per page (default: 10, max: 100)                           |
| `status`         | string  | Filter by status: `ON_TIME`, `LATE`, `EARLY`                     |
| `clockInMethod`  | string  | Filter by method: `GPS`, `WIFI`, `QR CODE`, `PHOTO`              |
| `clockOutMethod` | string  | Filter by clock-out method                                       |
| `userId`         | string  | Filter by specific employee                                      |
| `startDate`      | date    | Start date (YYYY-MM-DD)                                          |
| `endDate`        | date    | End date (YYYY-MM-DD)                                            |
| `search`         | string  | Search by employee name, email, employeeId, or location          |
| `sortBy`         | string  | Sort field: `clockInTime`, `clockOutTime`, `status`, `createdAt` |
| `sortOrder`      | string  | Sort order: `asc` or `desc` (default: `desc`)                    |

**Example Request:**

```
GET /api/v1/attendance/history?page=1&limit=20&status=LATE&startDate=2025-01-01&endDate=2025-01-31&sortBy=clockInTime&sortOrder=desc
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Attendance history retrieved successfully",
  "data": [
    {
      "id": "att_123",
      "clockInTime": "2025-01-15T09:03:00Z",
      "clockOutTime": "2025-01-15T17:30:00Z",
      "status": "LATE",
      "clockInMethod": "GPS",
      "clockOutMethod": "GPS",
      "clockInPhotoUrl": "https://...",
      "clockOutPhotoUrl": "https://...",
      "user": {
        "id": "user_456",
        "name": "John Doe",
        "email": "john@example.com",
        "employeeId": "EMP001"
      },
      "location": {
        "id": "loc_101",
        "name": "Headquarters"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

### Get My Attendance History (Mobile)

**GET** `/api/v1/attendance/my-history/:employeeId`

Retrieve attendance history for the current user (mobile app). Simplified response with essential fields only.

**Query Parameters:**

| Parameter   | Type    | Description                           |
| ----------- | ------- | ------------------------------------- |
| `page`      | integer | Page number (default: 1)              |
| `limit`     | integer | Items per page (default: 20, max: 50) |
| `startDate` | date    | Start date filter (YYYY-MM-DD)        |
| `endDate`   | date    | End date filter (YYYY-MM-DD)          |

**Example Request:**

```
GET /api/v1/attendance/my-history/user_456?page=1&limit=20&startDate=2025-01-01&endDate=2025-01-31
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Attendance history retrieved successfully",
  "data": [
    {
      "id": "att_123",
      "clockInTime": "2025-01-15T09:03:00Z",
      "clockOutTime": "2025-01-15T17:30:00Z",
      "totalHours": 8.5,
      "status": "ON_TIME",
      "location": {
        "name": "Headquarters"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## Late Reason Endpoint

### Add Late/Absent Reason

**PATCH** `/api/v1/attendance/:attendanceId/late-reason`

Add notes/reason for late or absent attendance. Only works for attendance records with status `LATE` or `ABSENT`.

**Request Body:**

```json
{
  "notes": "Traffic jam on the highway"
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Late reason updated successfully",
  "data": {
    "id": "att_123",
    "status": "LATE",
    "notes": "Traffic jam on the highway",
    ...
  }
}
```

**Error Responses:**

- `400` - Missing notes, attendance is not late or absent
- `404` - Attendance record not found
- `500` - Server error

---

## Manual Clock-Out Endpoint (Admin Only)

### Manual Clock-Out

**POST** `/api/v1/attendance/manual-clock-out`

Manually clock out an employee who forgot to clock out. **Admin/HR Staff only.**

**Request Body:**

```json
{
  "attendanceId": "att_123",
  "clockOutTime": "2025-01-15T17:30:00Z" // Optional, defaults to current time
}
```

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Employee clocked out successfully",
  "data": {
    "id": "att_123",
    "clockInTime": "2025-01-15T09:00:00Z",
    "clockOutTime": "2025-01-15T17:30:00Z",
    "clockOutMethod": "MANUAL",
    "totalHours": 8.5,
    "overtimeHours": 0.5,
    "notes": "Manually clocked out by admin"
  }
}
```

**Error Responses:**

- `400` - Missing attendance ID, invalid clock-out time, attendance already clocked out
- `401` - Unauthorized (not admin/HR staff)
- `404` - Attendance record not found
- `500` - Server error

**Use Cases:**

- Employee forgot to clock out
- System issues preventing clock-out
- Correction of attendance records
- Edge cases requiring manual intervention

**Note:** Hours and overtime are automatically calculated based on shift end time. If no shift is configured, only total hours are calculated.

---

## Photo Upload

### Overview

Photo verification is an **additional layer** that works with all clock-in/out methods (GPS, WiFi, QR Code). It is not a standalone method.

### Configuration

- **Optional by default**: Photos are optional unless company sets `requirePhoto = true`
- **Mandatory when required**: If `requirePhoto = true`, photo becomes mandatory for all clock-in/out operations

### Upload Methods

**Method 1: Multer File Upload (Recommended)**

- Field name: `image`
- Max file size: 5MB
- Supported formats: JPEG, JPG, PNG, WebP, GIF
- Content-Type: `multipart/form-data`

**Method 2: Pre-uploaded URL**

- Pass `photoUrl` in request body
- URL must be publicly accessible

### Storage

Photos are stored in R2 storage with the following path structure:

```
attendance/{tenantId}/{userId}/{clock-in|clock-out}/{timestamp}-{random}.{ext}
```

### Example with Multer

```javascript
const formData = new FormData();
formData.append("image", photoFile);
formData.append("latitude", 6.5244);
formData.append("longitude", 3.3792);

fetch("/api/v1/attendance/clock-in/gps", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});
```

---

## Attendance Status

The system automatically determines attendance status based on clock-in time:

- **EARLY**: 15+ minutes before shift start time
- **ON_TIME**: Within grace period (default: 5 minutes)
- **LATE**: After grace period
- **ABSENT**: No clock-in by shift end (marked by automation)

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

### Common HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation errors, missing required fields)
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Business Logic

### Clock-In Validation Flow

1. **User Authentication**: Verify JWT token
2. **Location Verification**:
   - GPS/QR Code: Check if within geofence radius
   - WiFi: Verify SSID matches company location
3. **Time Window Check**: Validate clock-in is within allowed window (not too early)
4. **Photo Verification** (if required): Upload and validate photo
5. **Status Determination**: Calculate ON_TIME, LATE, or EARLY
6. **Create Record**: Save attendance with all metadata

### Clock-Out Validation Flow

1. **Find Today's Record**: Locate existing clock-in for today
2. **Location Verification**: Same as clock-in
3. **Photo Verification** (if required): Upload photo
4. **Calculate Hours**: Automatically calculate total hours and overtime
5. **Update Record**: Add clock-out time, hours, and metadata

### Hours Calculation Logic

**On Clock-Out:**

1. **Total Hours Calculation**:

   - Formula: `(clockOutTime - clockInTime) / (1000 * 60 * 60)`
   - Represents actual time worked
   - Rounded to 2 decimal places

2. **Overtime Calculation**:
   - Only calculated if `clockOutTime > shiftEndTime`
   - Formula: `(clockOutTime - shiftEndTime) / (1000 * 60 * 60)`
   - If clock-out is before shift end, `overtimeHours = 0`
   - Handles night shifts (crosses midnight)
   - Rounded to 2 decimal places

**Examples:**

- **Normal Shift**: 9:00 AM - 5:00 PM, Clock-in: 9:00 AM, Clock-out: 6:30 PM

  - Total Hours: 9.5
  - Overtime: 1.5 hours

- **Night Shift**: 10:00 PM - 6:00 AM, Clock-in: 10:00 PM (Mon), Clock-out: 7:00 AM (Tue)
  - Total Hours: 9.0
  - Overtime: 1.0 hour

### Photo Requirement Logic

```javascript
if (tenant.requirePhoto === true) {
  // Photo is mandatory
  if (!photoUrl) {
    return error("Photo is required");
  }
} else {
  // Photo is optional
  // Accept if provided, skip if not
}
```

---

## Rate Limiting

All endpoints are subject to rate limiting. Check response headers for rate limit information.

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- Location coordinates are never stored (privacy-first design)
- WiFi SSIDs are verified but not stored
- QR payloads are verified but not stored
- Device info and IP addresses are stored for audit purposes
- Photo URLs are stored for accountability and buddy punching prevention
- **Employee Responsibility**: Employees must clock out manually. Failure to clock out may affect payroll calculations
- **Incomplete Records**: Attendance records without clock-out (`clockOutTime = null`) can be identified for payroll processing
- **Hours Calculation**: Total hours and overtime are automatically calculated on clock-out
- **Manual Clock-Out**: HR admins can manually clock out employees who forgot using the admin endpoint

---

**Version**: 1.0  
**Last Updated**: January 2025
