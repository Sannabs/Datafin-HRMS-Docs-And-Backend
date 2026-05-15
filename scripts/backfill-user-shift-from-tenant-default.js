/**
 * Backfill User.shiftId for rows that are still null, using the same rule as
 * resolveTenantEmployeeShiftId (default active shift, else first active shift).
 *
 * Usage:
 *   node scripts/backfill-user-shift-from-tenant-default.js --dry-run
 *   node scripts/backfill-user-shift-from-tenant-default.js
 *   node scripts/backfill-user-shift-from-tenant-default.js --tenant-id=<uuid> --dry-run
 *
 * Notes:
 * - Skips the platform tenant (code: "platform"), same as other tenant backfills.
 * - Only updates users with shiftId null, isDeleted false, deletedAt null.
 * - Safe to run multiple times (idempotent for users who already have shiftId).
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";
import { resolveTenantEmployeeShiftId } from "../utils/resolveTenantEmployeeShift.util.js";

const PLATFORM_TENANT_CODE = "platform";
const isDryRun = process.argv.includes("--dry-run");
const tenantIdArg = process.argv.find((a) => a.startsWith("--tenant-id="))?.split("=", 2)[1]?.trim();

async function run() {
    if (tenantIdArg) {
        const t = await prisma.tenant.findUnique({
            where: { id: tenantIdArg },
            select: { id: true, code: true },
        });
        if (!t) {
            console.error(`Unknown tenant id: ${tenantIdArg}`);
            process.exit(1);
        }
        if (t.code === PLATFORM_TENANT_CODE) {
            console.error("Refusing to backfill platform tenant.");
            process.exit(1);
        }
    }

    const userWhere = {
        shiftId: null,
        isDeleted: false,
        deletedAt: null,
        tenant: { code: { not: PLATFORM_TENANT_CODE } },
        ...(tenantIdArg ? { tenantId: tenantIdArg } : {}),
    };

    const groups = await prisma.user.groupBy({
        by: ["tenantId"],
        where: userWhere,
        _count: { _all: true },
    });

    console.log(
        `Backfill user.shiftId (${isDryRun ? "DRY RUN" : "LIVE"}): ${groups.length} tenant(s) with eligible user(s).`
    );

    let tenantsUpdated = 0;
    let usersTouched = 0;
    let tenantsSkippedNoShift = 0;

    for (const row of groups) {
        const tid = row.tenantId;
        const pending = row._count._all;

        const shiftId = await resolveTenantEmployeeShiftId(tid, { silent: true });
        if (!shiftId) {
            tenantsSkippedNoShift += 1;
            console.warn(
                `[SKIP] tenant ${tid}: no active shifts; ${pending} user(s) left unchanged`
            );
            continue;
        }

        if (isDryRun) {
            console.log(`[DRY] tenant ${tid}: would set shiftId for ${pending} user(s) -> ${shiftId}`);
            usersTouched += pending;
            tenantsUpdated += 1;
            continue;
        }

        const result = await prisma.user.updateMany({
            where: {
                tenantId: tid,
                shiftId: null,
                isDeleted: false,
                deletedAt: null,
            },
            data: { shiftId },
        });

        console.log(`[OK] tenant ${tid}: updated ${result.count} user(s) -> shift ${shiftId}`);
        usersTouched += result.count;
        tenantsUpdated += 1;
    }

    console.log(
        `Done. ${tenantsUpdated} tenant(s) ${isDryRun ? "would be" : "were"} processed, ` +
            `${usersTouched} user row(s) ${isDryRun ? "would be" : ""} touched, ` +
            `${tenantsSkippedNoShift} tenant(s) skipped (no shifts).`
    );
}

run()
    .catch((err) => {
        console.error("Backfill failed:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
