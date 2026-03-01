/**
 * Seed script: Initialize yearly leave entitlement for a user.
 * Usage: node scripts/seed-leave-entitlement.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Uses TENANT_ID and USER_ID from env or defaults (same as other seed scripts).
 * Requires AnnualLeavePolicy to exist for the tenant (run scripts/seed-leave-policy.js first).
 * Creates a YearlyEntitlement for the user for the current year so GET /leave/stats
 * and leave balance work. Safe to run multiple times (skips if entitlement exists).
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";

const TENANT_ID = process.env.TENANT_ID || "375e02fd-68f0-441d-be53-e6bbd49a746f";
const USER_ID = process.env.USER_ID || "3kOBHsM5gfyp8EDI2lqFxfRgPVboxDyM";

async function seed() {
  console.log("Seeding leave entitlement (user)...");
  console.log("tenantId:", TENANT_ID);
  console.log("userId:", USER_ID);

  const [tenant, user, policy] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: TENANT_ID } }),
    prisma.user.findUnique({ where: { id: USER_ID } }),
    prisma.annualLeavePolicy.findFirst({ where: { tenantId: TENANT_ID } }),
  ]);

  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}. Create the tenant first.`);
  }
  if (!user) {
    throw new Error(`User not found: ${USER_ID}. Create the user first.`);
  }
  if (!policy) {
    throw new Error(
      `No leave policy for tenant ${TENANT_ID}. Run scripts/seed-leave-policy.js first.`
    );
  }

  const currentYear = new Date().getFullYear();
  const existing = await prisma.yearlyEntitlement.findFirst({
    where: {
      tenantId: TENANT_ID,
      userId: USER_ID,
      year: currentYear,
    },
  });

  if (existing) {
    console.log("Yearly entitlement already exists for this user/year. Skipping.");
    console.log("  year:", currentYear);
    console.log("  allocatedDays:", existing.allocatedDays);
    return;
  }

  const yearStartDate = new Date(currentYear, 0, 1);
  const yearEndDate = new Date(currentYear, 11, 31);
  let carryoverExpiryDate = null;
  if (policy.carryoverExpiryMonths != null) {
    carryoverExpiryDate = new Date(currentYear, policy.carryoverExpiryMonths, 0);
  }
  const allocatedDays =
    policy.accrualMethod === "FRONT_LOADED" ? policy.defaultDaysPerYear : 0;

  await prisma.yearlyEntitlement.create({
    data: {
      tenantId: TENANT_ID,
      userId: USER_ID,
      policyId: policy.id,
      year: currentYear,
      allocatedDays,
      accruedDays: 0,
      carriedOverDays: 0,
      adjustmentDays: 0,
      usedDays: 0,
      pendingDays: 0,
      encashedDays: 0,
      encashmentAmount: 0,
      yearStartDate,
      yearEndDate,
      lastAccrualDate: null,
      carryoverExpiryDate,
    },
  });

  console.log("Created yearly entitlement for user", USER_ID, "year", currentYear);
  console.log("  allocatedDays:", allocatedDays);
  console.log("\nLeave entitlement seed complete.");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
