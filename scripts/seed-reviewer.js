/**
 * Seed a STAFF user for QA / review (mobile or web sign-in).
 *
 * Usage (from backend/, DATABASE_URL in .env):
 *   node ./scripts/seed-reviewer.js
 *
 * Optional env:
 *   TENANT_ID  — defaults to the same dev default as other seed scripts
 *
 * Credentials (fixed):
 *   Email:    reviewer@staffledger.com
 *   Password: Review@1234
 *   Role:     STAFF
 */

import "dotenv/config";
import crypto from "crypto";
import { hashPassword } from "better-auth/crypto";
import prisma from "../config/prisma.config.js";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";

const REVIEWER_EMAIL = "reviewer@staffledger.com";
const REVIEWER_PASSWORD = "Review@1234";
const REVIEWER_NAME = "Reviewer";

const TENANT_ID =
  process.env.TENANT_ID || "4824d306-f50f-41f2-8412-ae5dc15fc2db";

async function main() {
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
  });

  if (!tenant) {
    console.error(
      `Tenant not found: ${TENANT_ID}. Set TENANT_ID in .env to an existing tenant.`
    );
    process.exit(1);
  }

  const hashedPassword = await hashPassword(REVIEWER_PASSWORD);

  const existing = await prisma.user.findFirst({
    where: { tenantId: TENANT_ID, email: REVIEWER_EMAIL },
  });

  let user;

  if (existing) {
    user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        password: hashedPassword,
        name: REVIEWER_NAME,
        emailVerified: true,
        role: "STAFF",
        status: "ACTIVE",
        employmentType: "FULL_TIME",
      },
      select: {
        id: true,
        email: true,
        tenantId: true,
        role: true,
        employeeId: true,
        createdAt: true,
      },
    });

    const credAccount = await prisma.account.findFirst({
      where: { userId: user.id, providerId: "credential" },
    });

    if (credAccount) {
      await prisma.account.update({
        where: { id: credAccount.id },
        data: { password: hashedPassword },
      });
    } else {
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: hashedPassword,
        },
      });
    }

    console.log("Reviewer STAFF user updated:", {
      ...user,
      password: "(hidden — use Review@1234)",
    });
    return;
  }

  const employeeId = await generateEmployeeId(tenant.id, tenant, null);

  user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: REVIEWER_EMAIL,
      password: hashedPassword,
      name: REVIEWER_NAME,
      emailVerified: true,
      role: "STAFF",
      employeeId,
      status: "ACTIVE",
      employmentType: "FULL_TIME",
    },
    select: {
      id: true,
      email: true,
      tenantId: true,
      role: true,
      employeeId: true,
      createdAt: true,
    },
  });

  await prisma.account.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: hashedPassword,
    },
  });

  console.log("Reviewer STAFF user created:", {
    ...user,
    password: "(hidden — use Review@1234)",
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
