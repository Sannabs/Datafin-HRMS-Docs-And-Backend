import prisma from "../config/prisma.config.js";

// Format: {TENANT_CODE}-YYYYMMDD-XXXX
// Example: "ACM-20250115-0001" (where ACM is first 3 letters of tenant code)
export const generateEmployeeId = async (tenantId, tenantCode) => {
  const count = await prisma.user.count({
    where: {
      tenantId,
      isDeleted: false,
    },
  });

  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const sequence = String(count + 1).padStart(4, "0");
  const prefix = tenantCode.substring(0, 3).toUpperCase();

  return `${prefix}-${date}-${sequence}`;
};
