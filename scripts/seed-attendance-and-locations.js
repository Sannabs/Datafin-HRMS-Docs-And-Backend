/**
 * Seed script: Locations and Attendance records for a tenant/user.
 * Usage: node scripts/seed-attendance-and-locations.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Uses TENANT_ID and USER_ID from env or defaults (same as seed-recent-activities).
 * Creates 2 locations for the tenant, then attendance records for the user
 * for the last 7 days so stat cards and history display real data.
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";

const TENANT_ID = process.env.TENANT_ID || "375e02fd-68f0-441d-be53-e6bbd49a746f";
const USER_ID = process.env.USER_ID || "3kOBHsM5gfyp8EDI2lqFxfRgPVboxDyM";

function dayAt(daysAgo, hour, min) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d;
}

function addHours(date, hours) {
  const out = new Date(date);
  out.setTime(out.getTime() + hours * 60 * 60 * 1000);
  return out;
}

async function seed() {
  console.log("Seeding locations and attendance...");
  console.log("tenantId:", TENANT_ID);
  console.log("userId:", USER_ID);

  const user = await prisma.user.findUnique({ where: { id: USER_ID } });
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
  if (!user) {
    throw new Error(`User not found: ${USER_ID}. Create the user first.`);
  }
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}. Create the tenant first.`);
  }

  // 1) Create locations for the tenant if they don't exist
  const existingLocations = await prisma.location.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true },
  });
  const locationNames = ["Head Office", "Branch — Downtown"];
  const locationIdByName = {};

  for (const name of locationNames) {
    const existing = existingLocations.find((l) => l.name === name);
    if (existing) {
      locationIdByName[name] = existing.id;
      console.log("Location already exists:", name);
    } else {
      const loc = await prisma.location.create({
        data: {
          tenantId: TENANT_ID,
          name,
          latitude: 13.4549,
          longitude: -16.5790,
          wifiSSID: name === "Head Office" ? "Office-WiFi" : null,
        },
      });
      locationIdByName[name] = loc.id;
      console.log("Created location:", name, loc.id);
    }
  }

  const headOfficeId = locationIdByName["Head Office"] || existingLocations[0]?.id;
  const branchId = locationIdByName["Branch — Downtown"] || existingLocations[1]?.id;

  // 2) Delete existing attendance for this user so we can reseed predictably
  const deleted = await prisma.attendance.deleteMany({
    where: { tenantId: TENANT_ID, userId: USER_ID },
  });
  console.log("Deleted existing attendance records:", deleted.count);

  // 3) Create attendance for last 7 days (and 3 extra for history list)
  // Each day: clockIn, clockOut, totalHours, status, clockInMethod, locationId
  const records = [
    { daysAgo: 0, status: "ON_TIME", in: [8, 58], outHours: 8.57, method: "GPS", location: headOfficeId, overtime: 0.5 },
    { daysAgo: 1, status: "LATE", in: [9, 12], outHours: 8.55, method: "WIFI", location: headOfficeId, overtime: null },
    { daysAgo: 2, status: "EARLY", in: [8, 45], outHours: 8.25, method: "QR_CODE", location: null, overtime: null },
    { daysAgo: 3, status: "ON_TIME", in: [9, 0], outHours: 9.25, method: "GPS", location: branchId, overtime: 1.25 },
    { daysAgo: 4, status: "ON_TIME", in: [9, 0], outHours: 8.5, method: "GPS", location: headOfficeId, overtime: null },
    { daysAgo: 5, status: "LATE", in: [9, 15], outHours: 8.25, method: "WIFI", location: headOfficeId, overtime: null },
    { daysAgo: 6, status: "ON_TIME", in: [8, 55], outHours: 8.5, method: "GPS", location: headOfficeId, overtime: null },
    { daysAgo: 7, status: "ON_TIME", in: [9, 5], outHours: 8.0, method: "QR_CODE", location: branchId, overtime: null },
    { daysAgo: 8, status: "EARLY", in: [8, 30], outHours: 8.5, method: "GPS", location: headOfficeId, overtime: null },
    { daysAgo: 9, status: "ON_TIME", in: [9, 0], outHours: 8.5, method: "GPS", location: headOfficeId, overtime: null },
  ];

  for (const r of records) {
    const clockIn = dayAt(r.daysAgo, r.in[0], r.in[1]);
    const clockOut = addHours(clockIn, r.outHours);
    await prisma.attendance.create({
      data: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        locationId: r.location,
        clockInTime: clockIn,
        clockOutTime: clockOut,
        totalHours: r.outHours,
        overtimeHours: r.overtime ?? 0,
        status: r.status,
        clockInMethod: r.method,
        clockOutMethod: r.method,
        notes: r.status === "LATE" && r.daysAgo === 1 ? "Traffic on main road." : null,
      },
    });
  }
  console.log("Created", records.length, "attendance records.");

  console.log("Seed completed successfully.");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
