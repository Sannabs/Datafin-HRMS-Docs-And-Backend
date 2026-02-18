import prisma from "../config/prisma.config.js";

const EMPLOYEE_ID_REGEX = /^([A-Z]{2})-([A-Z]{2})-(\d{4})$/;

/**
 * Get 2-letter company prefix from tenant (name or code).
 * Pads with 'X' if source has < 2 characters.
 * @param {{ name: string, code: string }} tenant
 * @returns {string}
 */
function getCompanyPrefix(tenant) {
  const src = (tenant?.name || tenant?.code || "XX").trim();
  const chars = src.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (chars.length >= 2) return chars.substring(0, 2);
  return (chars + "X").substring(0, 2).padEnd(2, "X");
}

/**
 * Get 2-letter department prefix.
 * Returns "XX" if no department.
 * @param {{ name: string } | null} department
 * @returns {string}
 */
function getDepartmentPrefix(department) {
  if (!department?.name) return "XX";
  const chars = department.name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (chars.length >= 2) return chars.substring(0, 2);
  return (chars + "X").substring(0, 2).padEnd(2, "X");
}

/**
 * Generate 4 random digits (0000-9999).
 * @returns {string}
 */
function generateRandomDigits() {
  const n = Math.floor(Math.random() * 10000);
  return String(n).padStart(4, "0");
}

/**
 * Check if full employee ID is unique within tenant (company-scoped).
 * @param {string} tenantId
 * @param {string} fullId
 * @param {string} [excludeUserId] - User ID to exclude (for edit case)
 * @returns {Promise<boolean>}
 */
export async function isEmployeeIdUnique(tenantId, fullId, excludeUserId = null) {
  const where = {
    tenantId,
    employeeId: fullId,
    isDeleted: false,
  };
  if (excludeUserId) {
    where.id = { not: excludeUserId };
  }
  const existing = await prisma.user.findFirst({ where });
  return !existing;
}

/**
 * Parse employee ID into components. Returns null if format doesn't match.
 * @param {string} employeeId
 * @returns {{ companyPrefix: string, deptPrefix: string, digits: string } | null}
 */
export function parseEmployeeId(employeeId) {
  if (!employeeId || typeof employeeId !== "string") return null;
  const m = employeeId.trim().match(EMPLOYEE_ID_REGEX);
  if (!m) return null;
  return {
    companyPrefix: m[1],
    deptPrefix: m[2],
    digits: m[3],
  };
}

/**
 * Validate that digits are exactly 4 numeric characters.
 * @param {string} digits
 * @returns {boolean}
 */
export function validateEmployeeIdDigits(digits) {
  return /^[0-9]{4}$/.test(String(digits || "").trim());
}

/**
 * Generate a unique employee ID in format: [company]-[department]-[digits]
 * Example: DA-EN-0042 (Datafin, Engineering)
 *
 * @param {string} tenantId
 * @param {{ name: string, code: string }} tenant
 * @param {{ name: string } | null} [department]
 * @returns {Promise<string>}
 */
export const generateEmployeeId = async (tenantId, tenant, department = null) => {
  const companyPrefix = getCompanyPrefix(tenant);
  const deptPrefix = getDepartmentPrefix(department);
  const prefix = `${companyPrefix}-${deptPrefix}`;

  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const digits = generateRandomDigits();
    const fullId = `${prefix}-${digits}`;

    const unique = await isEmployeeIdUnique(tenantId, fullId);
    if (unique) return fullId;
  }

  // Fallback: use timestamp-based suffix if random collisions exceed limit
  const suffix = String(Date.now() % 10000).padStart(4, "0");
  return `${prefix}-${suffix}`;
};
