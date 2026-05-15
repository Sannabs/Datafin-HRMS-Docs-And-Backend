import prisma from "../config/prisma.config.js";
import logger from "./logger.js";

/**
 * Same rule as invitation acceptance: default active shift for tenant,
 * else first active shift by createdAt, else null.
 *
 * @param {string} tenantId
 * @param {{ logContext?: string; silent?: boolean }} [options] - optional label for logs (e.g. email); silent skips logger output (e.g. batch backfills)
 * @returns {Promise<string|null>}
 */
export async function resolveTenantEmployeeShiftId(tenantId, options = {}) {
    const { logContext, silent } = options;

    const defaultShift = await prisma.shift.findFirst({
        where: {
            tenantId,
            isDefault: true,
            isActive: true,
        },
    });

    if (defaultShift) {
        if (!silent) {
            if (logContext) {
                logger.info(`Assigning default shift to ${logContext}`);
            } else {
                logger.info(`Assigning default shift for tenant ${tenantId}`);
            }
        }
        return defaultShift.id;
    }

    const firstShift = await prisma.shift.findFirst({
        where: {
            tenantId,
            isActive: true,
        },
        orderBy: { createdAt: "asc" },
    });

    if (firstShift) {
        if (!silent) {
            if (logContext) {
                logger.warn(`No default shift found, using first active shift for ${logContext}`);
            } else {
                logger.warn(`No default shift found, using first active shift for tenant ${tenantId}`);
            }
        }
        return firstShift.id;
    }

    if (!silent) {
        logger.warn(
            `No active shifts found for tenant ${tenantId}, employee will be created without shift`
        );
    }
    return null;
}
