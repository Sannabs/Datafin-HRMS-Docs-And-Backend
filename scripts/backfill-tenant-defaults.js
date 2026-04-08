/**
 * Backfill script: ensure each tenant has:
 * 1) a default active shift
 * 2) an annual leave policy
 *
 * Usage:
 *   node scripts/backfill-tenant-defaults.js --dry-run
 *   node scripts/backfill-tenant-defaults.js
 *
 * Notes:
 * - Safe to run multiple times (idempotent).
 * - Excludes the platform tenant (code: "platform").
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";
import { normalizeTimeFormat, validateTimeFormat } from "../utils/attendance.util.js";

const isDryRun = process.argv.includes("--dry-run");
const DEFAULT_SHIFT_NAME = "Morning Shift";
const DEFAULT_SHIFT_START = "09:00";
const DEFAULT_SHIFT_END = "17:00";

validateTimeFormat(DEFAULT_SHIFT_START);
validateTimeFormat(DEFAULT_SHIFT_END);

const normalizedStart = normalizeTimeFormat(DEFAULT_SHIFT_START);
const normalizedEnd = normalizeTimeFormat(DEFAULT_SHIFT_END);

async function ensureTenantDefaults(tenant) {
  const defaultShift = await prisma.shift.findFirst({
    where: { tenantId: tenant.id, isDefault: true, isActive: true },
    select: { id: true, name: true },
  });

  const leavePolicy = await prisma.annualLeavePolicy.findUnique({
    where: { tenantId: tenant.id },
    select: { id: true },
  });

  const needsShift = !defaultShift;
  const needsLeavePolicy = !leavePolicy;

  if (!needsShift && !needsLeavePolicy) {
    return { tenantId: tenant.id, tenantCode: tenant.code, changed: false };
  }

  if (isDryRun) {
    return {
      tenantId: tenant.id,
      tenantCode: tenant.code,
      changed: true,
      actions: {
        createOrAssignDefaultShift: needsShift,
        createLeavePolicy: needsLeavePolicy,
      },
    };
  }

  await prisma.$transaction(async (tx) => {
    if (needsShift) {
      const firstActiveShift = await tx.shift.findFirst({
        where: { tenantId: tenant.id, isActive: true },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
        select: { id: true },
      });

      if (firstActiveShift) {
        await tx.shift.updateMany({
          where: { tenantId: tenant.id, isDefault: true },
          data: { isDefault: false },
        });
        await tx.shift.update({
          where: { id: firstActiveShift.id },
          data: { isDefault: true },
        });
      } else {
        await tx.shift.create({
          data: {
            tenantId: tenant.id,
            name: DEFAULT_SHIFT_NAME,
            startTime: normalizedStart,
            endTime: normalizedEnd,
            isDefault: true,
            isActive: true,
          },
        });
      }
    }

    if (needsLeavePolicy) {
      await tx.annualLeavePolicy.create({
        data: {
          tenantId: tenant.id,
          defaultDaysPerYear: 21,
          accrualMethod: "FRONT_LOADED",
          carryoverType: "FULL",
          advanceNoticeDays: 3,
        },
      });
    }
  });

  return {
    tenantId: tenant.id,
    tenantCode: tenant.code,
    changed: true,
    actions: {
      createOrAssignDefaultShift: needsShift,
      createLeavePolicy: needsLeavePolicy,
    },
  };
}

async function run() {
  console.log(`Backfill tenant defaults started (${isDryRun ? "DRY RUN" : "LIVE"})`);

  const tenants = await prisma.tenant.findMany({
    where: { code: { not: "platform" } },
    select: { id: true, code: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${tenants.length} tenant(s) to evaluate.`);

  let changedCount = 0;
  for (const tenant of tenants) {
    const result = await ensureTenantDefaults(tenant);
    if (!result.changed) continue;
    changedCount += 1;
    console.log(
      `[${isDryRun ? "DRY" : "OK"}] ${tenant.code} (${tenant.id}) ->` +
        ` shift:${result.actions?.createOrAssignDefaultShift ? "YES" : "NO"},` +
        ` leavePolicy:${result.actions?.createLeavePolicy ? "YES" : "NO"}`
    );
  }

  console.log(
    `Backfill complete. ${changedCount} tenant(s) ${isDryRun ? "would be" : "were"} updated.`
  );
}

run()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

