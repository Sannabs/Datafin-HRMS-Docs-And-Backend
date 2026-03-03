import "dotenv/config";
import crypto from "crypto";
import { hashPassword } from "better-auth/crypto";
import prisma from "../config/prisma.config.js";
import { ensurePlatformTenant } from "../utils/platformTenant.js";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";

async function main() {
  const email = process.env.SUPER_ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.SUPER_ADMIN_BOOTSTRAP_PASSWORD;
  const name = process.env.SUPER_ADMIN_BOOTSTRAP_NAME || "Platform Admin";

  if (!email || !password) {
    console.error(
      "Set SUPER_ADMIN_BOOTSTRAP_EMAIL and SUPER_ADMIN_BOOTSTRAP_PASSWORD in .env before running this script."
    );
    process.exit(1);
  }

  const hashedPassword = await hashPassword(password);

  const existing = await prisma.user.findFirst({
    where: {
      email,
      role: "SUPER_ADMIN",
    },
    select: { id: true },
    include: {
      accounts: {
        where: { providerId: "credential" },
        select: { id: true },
      },
    },
  });

  if (existing) {
    if (existing.accounts?.length > 0) {
      console.log("SUPER_ADMIN already exists for this email with credential account, nothing to do.");
      return;
    }
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        userId: existing.id,
        accountId: existing.id,
        providerId: "credential",
        password: hashedPassword,
      },
    });
    console.log("Credential account created for existing SUPER_ADMIN:", existing.id);
    return;
  }

  const platformTenant = await ensurePlatformTenant();

  const employeeId = await generateEmployeeId(
    platformTenant.id,
    platformTenant,
    null
  );

  const user = await prisma.user.create({
    data: {
      tenantId: platformTenant.id,
      email,
      password: hashedPassword,
      name,
      emailVerified: true,
      role: "SUPER_ADMIN",
      employeeId,
      status: "ACTIVE",
      employmentType: "FULL_TIME",
    },
    select: {
      id: true,
      email: true,
      tenantId: true,
      role: true,
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

  console.log("SUPER_ADMIN created:", user);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

