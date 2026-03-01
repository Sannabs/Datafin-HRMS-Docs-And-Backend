/**
 * Seed script: Leave requests for the current user.
 * Usage: node scripts/seed-leave-requests.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Uses TENANT_ID and USER_ID from env or defaults (same as other seed scripts).
 * Requires leave types to exist for the tenant (run scripts/seed-leave-types.js first).
 * Creates a set of leave requests with mixed statuses (PENDING, APPROVED, etc.)
 * for testing the time-off / leave list and pagination.
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";

const TENANT_ID = process.env.TENANT_ID || "375e02fd-68f0-441d-be53-e6bbd49a746f";
const USER_ID = process.env.USER_ID || "3kOBHsM5gfyp8EDI2lqFxfRgPVboxDyM";

function dateAt(daysFromToday) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toDateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function totalDays(start, end) {
  const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.ceil(diff) + 1);
}

async function seed() {
  console.log("Seeding leave requests...");
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

  const leaveTypes = await prisma.leaveType.findMany({
    where: { tenantId: TENANT_ID, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (leaveTypes.length === 0) {
    throw new Error(
      `No leave types found for tenant ${TENANT_ID}. Run scripts/seed-leave-types.js first.`
    );
  }

  const annualLeave = leaveTypes.find((t) => t.name === "Annual Leave") || leaveTypes[0];
  const sickLeave = leaveTypes.find((t) => t.name === "Sick Leave") || leaveTypes[0];
  const remoteWork = leaveTypes.find((t) => t.name === "Remote Work") || leaveTypes[0];

  // Optional: get a manager and HR user for approved requests (same tenant)
  const [manager, hr] = await Promise.all([
    prisma.user.findFirst({
      where: { tenantId: TENANT_ID, id: { not: USER_ID } },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { tenantId: TENANT_ID, id: { not: USER_ID } },
      select: { id: true },
    }),
  ]);
  const managerId = manager?.id ?? null;
  const hrId = hr?.id ?? null;
  const now = new Date();

  /** Requests to seed: startDaysOffset, endDaysOffset, leaveTypeName, status, reason */
  const REQUESTS = [
    { start: 14, end: 17, type: annualLeave, status: "PENDING", reason: "Family trip." },
    { start: 21, end: 22, type: remoteWork, status: "MANAGER_APPROVED", reason: "Working from home." },
    { start: -30, end: -28, type: annualLeave, status: "APPROVED", reason: "Annual leave." },
    { start: -60, end: -59, type: sickLeave, status: "APPROVED", reason: "Medical appointment." },
    { start: 45, end: 48, type: annualLeave, status: "PENDING", reason: "Planned vacation." },
    { start: -14, end: -12, type: remoteWork, status: "REJECTED", reason: "Remote work request." },
    { start: 7, end: 7, type: sickLeave, status: "CANCELLED", reason: "Sick day (cancelled)." },
  ];

  const deleted = await prisma.leaveRequest.deleteMany({
    where: { tenantId: TENANT_ID, userId: USER_ID },
  });
  console.log("Deleted existing leave requests for user:", deleted.count);

  for (const r of REQUESTS) {
    const startDate = toDateOnly(dateAt(r.start));
    const endDate = toDateOnly(dateAt(r.end));
    const totalDaysCount = totalDays(startDate, endDate);

    const data = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      leaveTypeId: r.type.id,
      startDate,
      endDate,
      totalDays: totalDaysCount,
      reason: r.reason ?? null,
      attachments: [],
      status: r.status,
      managerId: null,
      managerApprovedAt: null,
      hrId: null,
      hrApprovedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      cancelledAt: null,
    };

    if (r.status === "APPROVED" && managerId && hrId) {
      data.managerId = managerId;
      data.managerApprovedAt = now;
      data.hrId = hrId;
      data.hrApprovedAt = now;
    }
    if (r.status === "REJECTED" && managerId) {
      data.rejectedBy = managerId;
      data.rejectedAt = now;
      data.rejectionReason = "Not approved for this period.";
    }
    if (r.status === "CANCELLED") {
      data.cancelledAt = now;
    }
    if (r.status === "MANAGER_APPROVED" && managerId) {
      data.managerId = managerId;
      data.managerApprovedAt = now;
    }

    await prisma.leaveRequest.create({ data });
    console.log("Created:", r.type.name, r.status, `${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}`);
  }

  console.log("\nLeave requests seed complete. Created", REQUESTS.length, "request(s).");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
