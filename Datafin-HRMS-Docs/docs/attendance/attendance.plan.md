# HR Attendance Management System

## Technical Planning & Implementation Guide

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Clock-In Methods](#clock-in-methods)
- [System Architecture](#system-architecture)
- [Database Schema](#database-schema)
- [Business Logic & Workflows](#business-logic--workflows)
- [Automated Absence Marking](#automated-absence-marking)
- [Special Cases & Examples](#special-cases--examples)
- [API Endpoints](#api-endpoints)
- [Implementation Guidelines](#implementation-guidelines)
- [Security & Performance](#security--performance)
- [Quick Reference](#quick-reference)

---

## Executive Summary

A comprehensive mobile-based HR attendance management system supporting multiple verification methods while maintaining employee privacy and operational flexibility.

### Core Features

- **Multi-Method Verification**: GPS, WiFi, QR Code, Photo
- **Privacy-First Design**: No location data storage
- **Flexible Scheduling**: Company-wide and per-employee configurations
- **Automated Tracking**: Intelligent absence detection
- **Multi-Location Support**: Unlimited company locations
- **Real-Time Processing**: Instant status determination

---

## Clock-In Methods

### 1. GPS Location Verification

Employees verify their presence by enabling device location services. The app performs client-side distance calculations to ensure they're within the designated geofence radius.

**Workflow:**

1. Employee taps "Clock In with GPS"
2. App requests and retrieves device coordinates (client-side)
3. App fetches company locations from API
4. App calculates distance to nearest location
5. If within radius, clock-in is permitted
6. Server receives locationId only (no coordinates)

**Requirements:**

- Device GPS enabled
- Location permissions granted
- Internet connection
- Configured company locations

**Privacy:** GPS coordinates never leave the device. Only locationId is transmitted and stored.

---

### 2. WiFi Network Verification

Authentication occurs when employees connect to designated company WiFi networks.

**Workflow:**

1. Employee connects to company WiFi
2. Taps "Clock In with WiFi"
3. App detects connected SSID (client-side)
4. App fetches locations with WiFi configurations
5. App matches SSID against allowed networks
6. If matched, clock-in is permitted
7. Server receives locationId only (no SSID)

**Requirements:**

- WiFi connection
- WiFi permissions granted
- Configured WiFi SSIDs per location

**Privacy:** WiFi SSID verified locally, never stored in attendance records.

---

### 3. QR Code Scanning

Universal QR codes posted at entry points enable quick clock-in with optional location verification.

**Workflow:**

1. Company generates universal QR code
2. Employee taps "Clock In with QR Code"
3. App scans QR code via camera
4. App validates QR belongs to company
5. App optionally verifies GPS proximity
6. If valid, clock-in is permitted
7. Server receives locationId only

**Requirements:**

- Camera permissions
- Visible QR code at location
- Optional: GPS for proximity check

**Structure:**

- One QR code per company (not per location)
- Protected by location proximity logic
- Contains company secret/token

**Privacy:** QR value verified but not stored in attendance.

---

### 4. Photo Verification

Selfie capture prevents buddy punching and provides accountability. **Photo is NOT a standalone method** - it's an additional verification layer that works with GPS, WiFi, or QR Code methods.

**Workflow:**

1. Employee initiates clock-in with GPS/WiFi/QR Code method
2. If photo is required (company setting), camera launches automatically
3. Employee captures selfie
4. Photo uploads to cloud storage (S3/R2) via multer middleware
5. Photo URL stored in attendance record
6. Clock-in completes with primary method (GPS/WiFi/QR) + photo verification

**Configuration:**

- Optional or mandatory via `tenant.requirePhoto` setting
- Works as additional layer with any primary method (GPS, WiFi, QR Code)
- Secure storage with URL references in R2
- Can be provided via file upload or pre-uploaded URL

**Requirements:**

- Camera permissions
- Internet connection
- Cloud storage configured (R2/S3)

**Important:** Photo verification enhances security but does not replace location verification. Employees must still verify location via GPS/WiFi/QR Code.

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────┐
│       Mobile Application        │
│                                 │
│  ┌───────────────────────────┐ │
│  │  GPS Verification         │ │
│  │  WiFi Verification        │ │
│  │  QR Code Scanning         │ │
│  │  Photo Capture            │ │
│  └───────────────────────────┘ │
└────────────┬────────────────────┘
             │
             │ HTTPS/REST API
             │
┌────────────▼────────────────────┐
│       API Server Layer          │
│                                 │
│  ┌───────────────────────────┐ │
│  │  GPS Controller           │ │
│  │  WiFi Controller          │ │
│  │  QR Code Controller       │ │
│  │  Photo Controller         │ │
│  └───────────────────────────┘ │
└────────────┬────────────────────┘
             │
             │ Prisma ORM
             │
┌────────────▼────────────────────┐
│    PostgreSQL Database          │
│                                 │
│  - Companies                    │
│  - Users/Employees              │
│  - Locations                    │
│  - Shifts                       │
│  - Work Configurations          │
│  - Attendance Records           │
└────────────┬────────────────────┘
             │
             │ Automated Jobs
             │
┌────────────▼────────────────────┐
│        Cron Services            │
│                                 │
│  - Absence Marking (Hourly)    │
│  - Report Generation            │
│  - Notifications                │
└─────────────────────────────────┘
```

### Technology Stack

**Backend**

- Runtime: Node.js
- Language: TypeScript
- Framework: Express.js / Fastify
- ORM: Prisma
- Database: PostgreSQL

**Mobile**

- Framework: React Native / Flutter
- APIs: Native Location, Camera, WiFi

**Storage**

- Photos: AWS S3 / Cloudflare R2
- Data: PostgreSQL

**Automation**

- Scheduler: Node-cron / System cron
- Frequency: Every hour

---

## Database Schema

### Complete Prisma Schema

```prisma
// ============================================
// Tenant Model
// ============================================
model Tenant {
  id          String   @id @default(uuid())
  code        String
  name        String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  address     String?
  phone       String?
  email       String?
  website     String?

  // Weekend configuration: array of day numbers (0=Sunday, 6=Saturday)
  // Default: [0, 6] for Saturday/Sunday weekends
  // Middle East example: [5, 6] for Friday/Saturday weekends
  weekendDays Int[] @default([0, 6])

  // Clock-in configurations
  allowedClockInMethods   ClockMethod[]
  requirePhoto            Boolean        @default(false)
  geofenceRadius          Float          @default(100)
  gracePeriodMinutes      Int            @default(5)
  earlyClockInMinutes     Int            @default(60)

  // Relationships
  users            User[]
  locations        Location[]
  shifts           Shift[]
  companyWorkDays  CompanyWorkDay[]
  attendances      Attendance[]

  @@index([phone])
  @@index([email])
  @@index([website])
}

// ============================================
// User Model
// ============================================
model User {
  id              String              @id @default(cuid())
  email           String              @unique
  name            String
  employeeId      String?             @unique
  role            Role                @default(EMPLOYEE)

  tenantId        String
  tenant          Tenant              @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  shiftId         String?
  shift           Shift?              @relation(fields: [shiftId], references: [id], onDelete: SetNull)

  attendances     Attendance[]
  workConfig      EmployeeWorkConfig?

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([tenantId])
  @@index([shiftId])
}

// ============================================
// Location Model
// ============================================
model Location {
  id            String            @id @default(cuid())
  name          String
  latitude      Float
  longitude     Float
  wifiSSID      String?

  tenantId      String
  tenant        Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  attendances   Attendance[]

  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  @@index([tenantId])
}

// ============================================
// Shift Model
// ============================================
model Shift {
  id              String      @id @default(cuid())
  name            String
  startTime       String
  endTime         String
  isDefault       Boolean     @default(false)

  tenantId        String
  tenant          Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  users           User[]

  isActive        Boolean     @default(true)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([tenantId])
  @@index([isDefault])
}

// ============================================
// Work Day Configuration
// ============================================
model CompanyWorkDay {
  id              String      @id @default(cuid())

  monday          Boolean     @default(true)
  tuesday         Boolean     @default(true)
  wednesday       Boolean     @default(true)
  thursday        Boolean     @default(true)
  friday          Boolean     @default(true)
  saturday        Boolean     @default(false)
  sunday          Boolean     @default(false)

  tenantId        String      @unique
  tenant          Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model EmployeeWorkConfig {
  id              String      @id @default(cuid())

  monday          Boolean     @default(true)
  tuesday         Boolean     @default(true)
  wednesday       Boolean     @default(true)
  thursday        Boolean     @default(true)
  friday          Boolean     @default(true)
  saturday        Boolean     @default(false)
  sunday          Boolean     @default(false)

  userId          String      @unique
  user            User        @relation(fields: [userId], references: [id], onDelete: Cascade)

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  @@index([userId])
}

// ============================================
// Attendance Model
// ============================================
model Attendance {
  id                String          @id @default(cuid())

  userId            String
  user              User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  tenantId          String
  tenant            Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  locationId        String?
  location          Location?         @relation(fields: [locationId], references: [id], onDelete: SetNull)

  clockInTime       DateTime
  clockOutTime      DateTime?
  totalHours        Float?
  overtimeHours     Float?            @default(0)

  status            AttendanceStatus  @default(ON_TIME)

  clockInMethod     ClockMethod
  clockInPhotoUrl   String?
  clockInDeviceInfo String?
  clockInIpAddress  String?

  clockOutMethod     ClockMethod?
  clockOutPhotoUrl   String?
  clockOutDeviceInfo String?
  clockOutIpAddress  String?

  notes             String?

  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  @@index([userId, clockInTime])
  @@index([tenantId, clockInTime])
  @@index([locationId])
  @@index([status])
}

// ============================================
// Enums
// ============================================
enum Role {
  SUPER_ADMIN
  ADMIN
  MANAGER
  EMPLOYEE
}

enum ClockMethod {
  GPS
  WIFI
  QR_CODE
  PHOTO
}

enum AttendanceStatus {
  ON_TIME
  LATE
  EARLY
  ABSENT
  ON_LEAVE
}
```

### Schema Design Principles

1. **One Shift Per Employee**: Direct relation without junction table
2. **Privacy First**: No location coordinates or SSIDs in attendance
3. **Flexible Configuration**: Company defaults with employee overrides
4. **Comprehensive Indexing**: Optimized for common queries
5. **Audit Trail**: Device info and IP for accountability

---

## Business Logic & Workflows

### Clock-In Validation Flow

```javascript
async function validateClockIn(userId, locationId, currentTime) {
  // 1. Fetch employee with relations
  const employee = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      shift: true,
      workConfig: true,
      tenant: { include: { companyWorkDays: true } },
    },
  });

  // 2. Check if employee should work today
  const currentDay = getDayName(currentTime);
  const shouldWork = employee.workConfig
    ? employee.workConfig[currentDay]
    : employee.tenant.companyWorkDays[currentDay];

  if (!shouldWork) {
    throw new Error("Today is not a scheduled work day");
  }

  // 3. Check early clock-in window
  const shiftStart = parseTime(employee.shift.startTime);
  const earliestAllowed =
    shiftStart - employee.tenant.earlyClockInMinutes * 60000;

  if (currentTime < earliestAllowed) {
    throw new Error("Too early to clock in");
  }

  // 4. Determine status
  const status = determineStatus(
    currentTime,
    employee.shift,
    employee.tenant.gracePeriodMinutes
  );

  return { allowed: true, status };
}

function determineStatus(clockInTime, shift, gracePeriod) {
  const shiftStart = parseTime(shift.startTime);
  const diffMinutes = (clockInTime - shiftStart) / 60000;

  if (diffMinutes < -15) return "EARLY";
  if (diffMinutes <= gracePeriod) return "ON_TIME";
  return "LATE";
}
```

### Work Day Priority Logic

```javascript
function shouldEmployeeWorkToday(employee, dayName) {
  // Priority 1: Employee custom config
  if (employee.workConfig) {
    return employee.workConfig[dayName];
  }

  // Priority 2: Tenant default
  return employee.tenant.companyWorkDays[dayName];
}
```

**Examples:**

- Regular employee (no custom config) → Uses company Mon-Fri
- Part-time (Mon-Wed-Fri config) → Overrides company default
- Weekend worker (Sat-Sun config) → Works when company closed
- New employee (no config) → Defaults to company schedule

---

## Automated Absence Marking

### Strategy

**Timing**: Mark absent AT shift end, not during grace period.

**Rationale**:

- Maximum accuracy (employee had full shift duration)
- No false positives (very late = LATE, not ABSENT)
- Clean data (one status, no updates)
- Fair to employees

### Implementation

```javascript
// cron/markAbsentEmployees.js

async function markAbsentEmployees() {
  const now = new Date();
  const currentDay = getDayName(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const employees = await prisma.user.findMany({
    where: {
      shiftId: { not: null },
      role: "EMPLOYEE",
    },
    include: {
      shift: true,
      workConfig: true,
      tenant: { include: { companyWorkDays: true } },
    },
  });

  for (const employee of employees) {
    // Step 1: Should work today?
    const shouldWork = employee.workConfig
      ? employee.workConfig[currentDay]
      : employee.tenant.companyWorkDays[currentDay];

    if (!shouldWork) continue;

    // Step 2: Has shift ended?
    const shiftEnded = checkShiftEnded(employee.shift, currentMinutes);
    if (!shiftEnded) continue;

    // Step 3: Check attendance
    const window = getAttendanceWindow(employee.shift, now);
    const attendance = await prisma.attendance.findFirst({
      where: {
        userId: employee.id,
        clockInTime: { gte: window.start, lte: window.end },
      },
    });

    if (attendance) continue;

    // Step 4: Mark absent
    await prisma.attendance.create({
      data: {
        userId: employee.id,
        tenantId: employee.tenantId,
        clockInTime: now,
        status: "ABSENT",
        clockInMethod: "GPS",
        notes: `Marked absent - ${employee.shift.name}`,
      },
    });
  }
}

function checkShiftEnded(shift, currentMinutes) {
  const startMinutes = parseTimeToMinutes(shift.startTime);
  const endMinutes = parseTimeToMinutes(shift.endTime);

  // Night shift handling
  if (endMinutes < startMinutes) {
    if (currentMinutes >= startMinutes) return false;
    return currentMinutes >= endMinutes;
  }

  // Normal shift
  return currentMinutes >= endMinutes;
}

function getAttendanceWindow(shift, currentTime) {
  const startMinutes = parseTimeToMinutes(shift.startTime);
  const endMinutes = parseTimeToMinutes(shift.endTime);

  // Night shift (crosses midnight)
  if (endMinutes < startMinutes) {
    const start = new Date(currentTime);
    start.setDate(start.getDate() - 1);
    const [h, m] = shift.startTime.split(":").map(Number);
    start.setHours(h, m, 0, 0);

    const end = new Date(currentTime);
    const [eh, em] = shift.endTime.split(":").map(Number);
    end.setHours(eh, em, 0, 0);

    return { start, end };
  }

  // Normal shift
  const start = new Date(currentTime);
  start.setHours(0, 0, 0, 0);
  return { start, end: currentTime };
}
```

### Cron Schedule

```bash
# Every hour
0 * * * * node /path/to/markAbsentEmployees.js

# Every 30 minutes (faster detection)
*/30 * * * * node /path/to/markAbsentEmployees.js
```

---

## Special Cases & Examples

### Case 1: Multiple Shifts Same Day

**Scenario**: Company has Morning (6am-2pm), Afternoon (2pm-10pm), Night (10pm-6am)

**At 3pm cron run**:

- Employee A (Morning): Shift ended 2pm → Check attendance → Mark ABSENT if none
- Employee B (Afternoon): Shift ends 10pm → Skip (ongoing)
- Employee C (Night): Shift ends 6am tomorrow → Skip (not started)

### Case 2: Night Shift (Crosses Midnight)

**Shift**: 10pm Monday - 6am Tuesday

**Timeline**:

```
Mon 10pm: Shift starts
Mon 11pm: Cron runs → Skip (shift ongoing)
Tue 12am: Midnight
Tue 1am:  Cron runs → Skip (shift ongoing)
Tue 6am:  Shift ends
Tue 7am:  Cron runs → Check attendance from Mon 10pm-Tue 6am → Mark if absent
```

### Case 3: Part-Time Employee

**Setup**:

- Company: Mon-Fri
- Employee: Mon, Wed, Fri only (custom config)

**Tuesday**: Cron skips (not employee's work day)
**Wednesday**: Cron checks and marks absent if no clock-in

### Case 4: Very Late Clock-In

**Scenario**: Shift 9am-5pm, employee arrives 2pm

**Result**:

- 2pm clock-in: Status = LATE
- 6pm cron: Finds attendance record → Skip
- Final status: LATE (not ABSENT)

### Case 5: Weekend Worker

**Setup**:

- Company: Mon-Fri only
- Employee: Sat-Sun only (custom config)

**Saturday cron**:

- Company closed (Saturday = false)
- Employee works (Saturday = true)
- Uses employee config → Marks absent if no clock-in

---

## API Endpoints

### Clock-In/Out

```
POST /api/v1/attendance/clock-in/gps      (with optional photo)
POST /api/v1/attendance/clock-in/wifi     (with optional photo)
POST /api/v1/attendance/clock-in/qrcode   (with optional photo)

POST /api/v1/attendance/clock-out/gps     (with optional photo)
POST /api/v1/attendance/clock-out/wifi     (with optional photo)
POST /api/v1/attendance/clock-out/qrcode   (with optional photo)
```

**Note:** Photo upload is handled via multer middleware on all clock-in/out endpoints. Photo is an additional layer, not a standalone method.

### Additional Endpoints

```
GET  /api/v1/attendance/history                    (Admin - all employees)
GET  /api/v1/attendance/my-history/:employeeId      (Employee - own history)
PATCH /api/v1/attendance/:attendanceId/late-reason   (Employee - add late/absent reason)
POST /api/v1/attendance/manual-clock-out            (Admin - manual clock-out)
```

### Configuration

```
GET  /api/company/:id
PUT  /api/company/:id/settings
GET  /api/locations?companyId=:id
POST /api/locations
GET  /api/shifts
POST /api/shifts
PUT  /api/shifts/:id
GET  /api/attendance/history
```

### Request/Response Example

**Request**:

```json
POST /api/attendance/clock-in/gps

{
  "userId": "user_123",
  "locationId": "loc_456",
  "method": "GPS",
  "photoUrl": "https://cdn.../photo.jpg",
  "deviceInfo": "iPhone 14",
  "ipAddress": "192.168.1.100"
}
```

**Response**:

```json
{
  "success": true,
  "attendance": {
    "id": "att_789",
    "clockInTime": "2024-01-15T09:03:00Z",
    "status": "ON_TIME",
    "locationName": "Headquarters"
  }
}
```

---

## Implementation Guidelines

### Phase 1: Foundation (Week 1-2)

- Database setup with Prisma
- Authentication system
- Company and user management
- Location management

### Phase 2: Clock-In Methods (Week 3-4)

- GPS verification (client-side)
- WiFi verification (client-side)
- QR code generation and scanning
- Photo capture and upload
- Controller implementation for each method

### Phase 3: Shift Management (Week 5-6)

- Shift CRUD operations
- Shift assignment system
- Work day configuration UI
- Employee work config management

### Phase 4: Attendance & Reports (Week 7-8)

- Status determination logic
- Attendance history views
- Reports and analytics
- Export functionality

### Phase 5: Automation (Week 9-10)

- Cron job setup
- Absent marking implementation
- Notification system
- Real-time dashboard

### Testing Strategy

- Unit tests: Business logic functions
- Integration tests: API endpoints
- E2E tests: Complete clock-in flows
- Edge cases: Night shifts, part-time workers
- Load tests: Cron job performance

---

## Security & Performance

### Privacy Protection

- No GPS coordinates stored
- No WiFi SSIDs stored
- Client-side verification only
- Secure photo URLs
- GDPR compliant by design

### Authentication

- JWT-based auth
- Role-based access control (RBAC)
- Company data isolation
- Device fingerprinting

### Performance Optimization

**Database Indexing**:

```prisma
@@index([userId, clockInTime])
  @@index([tenantId, clockInTime])
@@index([locationId])
@@index([status])
@@index([shiftId])
```

**Caching Strategy**:

- Company settings (Redis)
- Location data (Memory cache)
- Shift configurations (Redis)
- Work day configs (Memory cache)

**Query Optimization**:

- Selective includes
- Batch processing
- Pagination (50 records/page)
- Aggregation for reports

---

## Quick Reference

### Configuration Defaults

```javascript
{
  geofenceRadius: 100,        // meters
  gracePeriodMinutes: 5,      // minutes
  earlyClockInMinutes: 60,    // minutes
  requirePhoto: false,
  allowedMethods: ['GPS', 'WIFI', 'QR_CODE', 'PHOTO']
}
```

### Time Formats

- Shifts: 24-hour format ("09:00", "17:00")
- Timestamps: ISO 8601
- Timezone: UTC (convert client-side)

### Status Definitions

- **EARLY**: 15+ minutes before shift
- **ON_TIME**: Within grace period
- **LATE**: After grace period
- **ABSENT**: No clock-in by shift end
- **ON_LEAVE**: Approved leave

### Helper Functions

```javascript
// Parse time string to minutes
function parseTimeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// Get day name
function getDayName(date) {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[date.getDay()];
}

// Calculate distance (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
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
}
```

---

## Project Structure

```
project-root/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── controllers/
│   │   └── attendance/
│   │       ├── gps.controller.ts
│   │       ├── wifi.controller.ts
│   │       ├── qrcode.controller.ts
│   │       └── photo.controller.ts
│   ├── cron/
│   │   └── markAbsentEmployees.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── validation.ts
│   ├── routes/
│   │   ├── attendance.routes.ts
│   │   ├── company.routes.ts
│   │   └── shift.routes.ts
│   └── utils/
│       ├── shiftHelpers.ts
│       └── timeHelpers.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/
    └── README.md
```

---

**Version**: 1.0  
**Date**: December 2024  
**Status**: Ready for Implementation
