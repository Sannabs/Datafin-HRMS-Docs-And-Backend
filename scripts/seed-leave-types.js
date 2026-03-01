/**
 * Seed script: Leave types for a tenant.
 * Usage: node scripts/seed-leave-types.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Uses TENANT_ID from env or default (same as other seed scripts).
 * Creates leave types (Annual Leave, Sick Leave, Remote Work, etc.) if they
 * don't already exist for the tenant. Safe to run multiple times (skip by name).
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";

const TENANT_ID = process.env.TENANT_ID || "375e02fd-68f0-441d-be53-e6bbd49a746f";

/** Leave types to seed: name -> { description?, color?, isPaid, deductsFromAnnual, requiresDocument } */
const LEAVE_TYPES = [
  {
    name: "Annual Leave",
    description: "Standard annual leave deducted from yearly entitlement",
    color: "#22c55e",
    isPaid: true,
    deductsFromAnnual: true,
    requiresDocument: false,
  },
  {
    name: "Sick Leave",
    description: "Leave for illness or medical appointments",
    color: "#ef4444",
    isPaid: true,
    deductsFromAnnual: false,
    requiresDocument: true,
  },
  {
    name: "Remote Work",
    description: "Working from home or remote location",
    color: "#3b82f6",
    isPaid: true,
    deductsFromAnnual: false,
    requiresDocument: false,
  },
  {
    name: "Maternity Leave",
    description: "Leave for new mothers",
    color: "#ec4899",
    isPaid: true,
    deductsFromAnnual: false,
    requiresDocument: true,
  },
  {
    name: "Unpaid Leave",
    description: "Leave without pay",
    color: "#6b7280",
    isPaid: false,
    deductsFromAnnual: false,
    requiresDocument: false,
  },
  {
    name: "Study Leave",
    description: "Leave for training or study",
    color: "#8b5cf6",
    isPaid: true,
    deductsFromAnnual: false,
    requiresDocument: false,
  },
];

async function seed() {
  console.log("Seeding leave types...");
  console.log("tenantId:", TENANT_ID);

  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}. Create the tenant first.`);
  }

  let created = 0;
  let skipped = 0;

  for (const lt of LEAVE_TYPES) {
    const existing = await prisma.leaveType.findFirst({
      where: { tenantId: TENANT_ID, name: lt.name },
    });
    if (existing) {
      console.log("Leave type already exists:", lt.name);
      skipped += 1;
      continue;
    }
    await prisma.leaveType.create({
      data: {
        tenantId: TENANT_ID,
        name: lt.name,
        description: lt.description ?? null,
        color: lt.color ?? null,
        isPaid: lt.isPaid,
        deductsFromAnnual: lt.deductsFromAnnual,
        requiresDocument: lt.requiresDocument ?? false,
        isActive: true,
      },
    });
    console.log("Created leave type:", lt.name);
    created += 1;
  }

  console.log("\nLeave types seed complete. Created:", created, "Skipped:", skipped);
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
