import prisma from "../config/prisma.config.js";
import logger from "./logger.js";

const PLATFORM_TENANT_CODE = "platform";

export async function ensurePlatformTenant() {
  let tenant = await prisma.tenant.findFirst({
    where: { code: PLATFORM_TENANT_CODE },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        code: PLATFORM_TENANT_CODE,
        name: "Datafin Platform",
        email: process.env.PLATFORM_TENANT_EMAIL || null,
      },
    });

    logger.info("Platform tenant created", {
      tenantId: tenant.id,
      code: tenant.code,
    });
  }

  return tenant;
}

