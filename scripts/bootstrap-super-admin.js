import "dotenv/config";
import bcrypt from "bcryptjs";
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

  const existing = await prisma.user.findFirst({
    where: {
      email,
      role: "SUPER_ADMIN",
    },
    select: { id: true },
  });

  if (existing) {
    console.log("SUPER_ADMIN already exists for this email, nothing to do.");
    return;
  }

  const platformTenant = await ensurePlatformTenant();

  const employeeId = await generateEmployeeId(
    platformTenant.id,
    platformTenant,
    null
  );
  const hashedPassword = await bcrypt.hash(password, 10);

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

