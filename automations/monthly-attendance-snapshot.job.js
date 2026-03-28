import cron from "node-cron";
import { DateTime } from "luxon";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import {
  effectiveTimeZone,
  ensureMonthlyAttendanceSnapshot,
} from "../services/employee-attendance-stats.service.js";

/**
 * Once per day (UTC): for each active tenant, if local calendar day is the 1st,
 * ensure monthly attendance stat snapshots exist for the previous calendar month
 * (in that tenant's timezone). Idempotent per user/month.
 */
export function startMonthlyAttendanceSnapshotJob() {
  cron.schedule("20 4 * * *", async () => {
    try {
      const tenants = await prisma.tenant.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, timezone: true },
      });

      for (const t of tenants) {
        const tz = effectiveTimeZone(t.timezone);
        const today = DateTime.now().setZone(tz);
        if (today.day !== 1) continue;

        const prev = today.minus({ months: 1 });
        const users = await prisma.user.findMany({
          where: { tenantId: t.id, isDeleted: false },
          select: { id: true },
        });

        for (const u of users) {
          await ensureMonthlyAttendanceSnapshot(prisma, {
            tenantId: t.id,
            userId: u.id,
            calendarYear: prev.year,
            calendarMonth: prev.month,
            timeZone: tz,
            computedBy: null,
          });
        }

        logger.info(
          `[MonthlyStatSnap] tenant ${t.id}: ensured snapshots for ${prev.year}-${String(prev.month).padStart(2, "0")} (${users.length} users)`
        );
      }
    } catch (error) {
      logger.error(`[MonthlyStatSnap] ${error.message}`, { stack: error.stack });
    }
  });

  logger.info("[MonthlyStatSnap] Cron registered (04:20 UTC daily)");
}
