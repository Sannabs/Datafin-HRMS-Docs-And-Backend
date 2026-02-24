/**
 * Seed script: Locations and Attendance records for a tenant/user.
 * Usage: node scripts/seed-attendance-and-locations.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Uses TENANT_ID and USER_ID from env or defaults (same as seed-recent-activities).
 * Creates 2 locations for the tenant, then attendance records for the user
 * for the last ~60 days so stat cards, history, and pagination/load-more can be tested.
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
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
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

  // 3) Build records with hardcoded values for all schema fields
  const statuses = ["ON_TIME", "ON_TIME", "ON_TIME", "LATE", "EARLY"];
  const methods = ["GPS", "WIFI", "QR_CODE"];
  const locationIds = [headOfficeId, headOfficeId, branchId, null];

  // First 10 days: fully hardcoded
  const fixed = [
    { daysAgo: 0,  status: "ON_TIME", in: [8, 58],  totalHours: 8.57, overtimeHours: 0.53, method: "GPS",     locationId: headOfficeId },
    { daysAgo: 1,  status: "LATE",    in: [9, 12],   totalHours: 8.47, overtimeHours: 0.67, method: "WIFI",    locationId: headOfficeId, notes: "Traffic on main road." },
    { daysAgo: 2,  status: "EARLY",   in: [8, 45],   totalHours: 8.25, overtimeHours: 0,    method: "QR_CODE", locationId: null },
    { daysAgo: 3,  status: "ON_TIME", in: [9, 0],    totalHours: 9.25, overtimeHours: 1.25, method: "GPS",     locationId: branchId },
    { daysAgo: 4,  status: "ON_TIME", in: [9, 0],    totalHours: 8.5,  overtimeHours: 0.5,  method: "GPS",     locationId: headOfficeId },
    { daysAgo: 5,  status: "LATE",    in: [9, 15],   totalHours: 8.17, overtimeHours: 0.42, method: "WIFI",    locationId: headOfficeId },
    { daysAgo: 6,  status: "ON_TIME", in: [8, 55],   totalHours: 8.5,  overtimeHours: 0.42, method: "GPS",     locationId: headOfficeId },
    { daysAgo: 7,  status: "ON_TIME", in: [9, 5],    totalHours: 8.0,  overtimeHours: 0.08, method: "QR_CODE", locationId: branchId },
    { daysAgo: 8,  status: "EARLY",   in: [8, 30],   totalHours: 8.5,  overtimeHours: 0,    method: "GPS",     locationId: headOfficeId },
    { daysAgo: 9,  status: "ON_TIME", in: [9, 0],    totalHours: 8.5,  overtimeHours: 0.5,  method: "GPS",     locationId: headOfficeId },
  ];

  // Days 10–59: generated with hardcoded totalHours / overtimeHours for pagination testing
  const generated = [];
  for (let daysAgo = 10; daysAgo < 60; daysAgo++) {
    const status = statuses[daysAgo % statuses.length];
    const method = methods[daysAgo % methods.length];
    const locationId = locationIds[daysAgo % locationIds.length];
    const inHour = status === "LATE" ? 9 : status === "EARLY" ? 8 : 9;
    const inMin = status === "LATE" ? 15 : status === "EARLY" ? 30 : 0;
    const totalHours = [8.0, 8.25, 8.5, 8.75, 9.0][daysAgo % 5];
    const overtimeHours = [0, 0, 0.5, 0.75, 1.0][daysAgo % 5];
    generated.push({ daysAgo, status, in: [inHour, inMin], totalHours, overtimeHours, method, locationId });
  }

  const records = [...fixed, ...generated];

  for (const r of records) {
    const clockInTime = dayAt(r.daysAgo, r.in[0], r.in[1]);
    const clockOutTime = addHours(clockInTime, r.totalHours);

    await prisma.attendance.create({
      data: {
        tenantId: TENANT_ID,
        userId: USER_ID,
        locationId: r.locationId,
        clockInTime,
        clockOutTime,
        totalHours: r.totalHours,
        overtimeHours: r.overtimeHours,
        status: r.status,
        clockInMethod: r.method,
        clockOutMethod: r.method,
        notes: r.notes || null,
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
