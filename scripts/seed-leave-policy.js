/**
 * Seed script: Initialize annual leave policy for a tenant (company).
 * Usage: node scripts/seed-leave-policy.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Uses TENANT_ID from env or default (same as other seed scripts).
 * Creates one AnnualLeavePolicy per tenant with default values if none exists.
 * Safe to run multiple times (skips when policy already exists).
 *
 * Defaults:
 *   - defaultDaysPerYear: 21
 *   - accrualMethod: FRONT_LOADED
 *   - carryoverType: FULL
 *   - advanceNoticeDays: 0
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";

const TENANT_ID = process.env.TENANT_ID || "375e02fd-68f0-441d-be53-e6bbd49a746f";

async function seed() {
  console.log("Seeding leave policy...");
  console.log("tenantId:", TENANT_ID);

  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}. Create the tenant first.`);
  }

  const existing = await prisma.annualLeavePolicy.findUnique({
    where: { tenantId: TENANT_ID },
  });

  if (existing) {
    console.log("Leave policy already exists for this tenant. Skipping.");
    console.log("  defaultDaysPerYear:", existing.defaultDaysPerYear);
    console.log("  accrualMethod:", existing.accrualMethod);
    console.log("  carryoverType:", existing.carryoverType);
    return;
  }

  const policy = await prisma.annualLeavePolicy.create({
    data: {
      tenantId: TENANT_ID,
      defaultDaysPerYear: 21,
      accrualMethod: "FRONT_LOADED",
      accrualFrequency: null,
      accrualDaysPerPeriod: null,
      carryoverType: "FULL",
      maxCarryoverDays: null,
      carryoverExpiryMonths: null,
      encashmentRate: null,
      advanceNoticeDays: 0,
    },
  });

  console.log("Created leave policy:", policy.id);
  console.log("  defaultDaysPerYear: 21");
  console.log("  accrualMethod: FRONT_LOADED");
  console.log("  carryoverType: FULL");
  console.log("  advanceNoticeDays: 0");
  console.log("\nLeave policy seed complete.");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
