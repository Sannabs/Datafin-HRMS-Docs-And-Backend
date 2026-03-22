import prisma from "../config/prisma.config.js";

/**
 * Human-readable batch code: BT-YYYY-NNNN (per tenant, per year sequence).
 */
export async function generateBatchCode(tenantId) {
    const year = new Date().getFullYear();
    const prefix = `BT-${year}-`;

    const latest = await prisma.batchJob.findFirst({
        where: {
            tenantId,
            batchCode: { startsWith: prefix },
        },
        orderBy: { batchCode: "desc" },
        select: { batchCode: true },
    });

    let next = 1;
    if (latest?.batchCode) {
        const part = latest.batchCode.slice(prefix.length);
        const n = parseInt(part, 10);
        if (!Number.isNaN(n)) next = n + 1;
    }

    return `${prefix}${String(next).padStart(3, "0")}`;
}
