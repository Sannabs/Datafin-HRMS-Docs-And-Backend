import prisma from "../config/prisma.config.js";

/**
 * Generates a unique payroll run code for a tenant
 * Format: PR-YYYY-XXX (e.g., "PR-2025-001")
 * 
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<string>} Generated payroll run code
 */
export const generatePayrollRunCode = async (tenantId) => {
  // Get the count of payroll runs for this tenant in the current year
  const currentYear = new Date().getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59);

  const count = await prisma.payrollRun.count({
    where: {
      tenantId,
      createdAt: {
        gte: yearStart,
        lte: yearEnd,
      },
    },
  });

  // Generate sequence number (pad with zeros to 3 digits)
  const sequence = String(count + 1).padStart(3, "0");

  return `PR-${currentYear}-${sequence}`;
};
