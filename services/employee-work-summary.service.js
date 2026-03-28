import { DateTime } from "luxon";
import {
  effectiveTimeZone,
  calendarMonthRangeInZone,
  currentCalendarMonthRangeInZone,
  computeLiveEmployeeAttendanceStats,
  payPeriodSnapshotToStatsData,
  ensureMonthlyAttendanceSnapshot,
} from "./employee-attendance-stats.service.js";

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {string} tenantId
 * @param {string} userId
 * @param {{ id: string, startDate: Date, endDate: Date, status: string }} payPeriod
 * @param {string | null} computedBy
 */
async function statsPayloadForPayPeriod(prisma, tenantId, userId, payPeriod, computedBy) {
  if (payPeriod.status === "CLOSED") {
    const existingSnapshot = await prisma.attendanceStatSnapshot.findFirst({
      where: { tenantId, userId, payPeriodId: payPeriod.id },
    });
    if (existingSnapshot) {
      return payPeriodSnapshotToStatsData(existingSnapshot, payPeriod.id);
    }
  }

  const rangeStart = new Date(payPeriod.startDate);
  const rangeEnd = new Date(payPeriod.endDate);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return null;
  }
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(23, 59, 59, 999);

  const live = await computeLiveEmployeeAttendanceStats(prisma, {
    tenantId,
    userId,
    rangeStart,
    rangeEnd,
    resolvedPayPeriod: payPeriod,
    persistClosedSnapshot: payPeriod.status === "CLOSED",
    computedBy,
  });

  if (!live.ok) return null;
  return live.responseData;
}

function workSummaryRowFromStats(periodType, rowKey, stats) {
  const start = stats.period?.startDate ?? "";
  const end = stats.period?.endDate ?? "";
  return {
    rowKey,
    kind: periodType === "Month" ? "CALENDAR_MONTH" : "PAY_PERIOD",
    periodType,
    period: start && end ? `${start} -> ${end}` : "—",
    periodStart: start,
    periodEnd: end,
    source: stats.snapshot ? "Snapshot" : "Live",
    presentRate: stats.presentRate,
    absentRate: stats.absentRate,
    lateRate: stats.lateRate,
    overtimeHoursRate: stats.overtimeHoursRate ?? stats.overtimeRate ?? 0,
    noData: Boolean(stats.noData),
    sortEnd: end ? new Date(end).getTime() : 0,
  };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   tenantId: string,
 *   userId: string,
 *   requestUserRole: string,
 *   monthsBack?: number,
 *   payPeriodsBack?: number,
 *   computedBy?: string | null,
 * }} args
 */
export async function buildEmployeeWorkSummary(prisma, args) {
  const {
    tenantId,
    userId,
    requestUserRole,
    monthsBack: monthsBackRaw = 6,
    payPeriodsBack: payPeriodsBackRaw = 6,
    computedBy = null,
  } = args;

  const monthsBack = Math.min(Math.max(Number(monthsBackRaw) || 6, 1), 24);
  const payPeriodsBack = Math.min(Math.max(Number(payPeriodsBackRaw) || 6, 1), 24);
  const includePayPeriodRows =
    requestUserRole === "HR_ADMIN" || requestUserRole === "HR_STAFF";

  const employee = await prisma.user.findFirst({
    where: { id: userId, tenantId, isDeleted: false },
    select: {
      id: true,
      tenant: { select: { timezone: true } },
    },
  });

  if (!employee) {
    return { ok: false, code: "EMPLOYEE_NOT_FOUND" };
  }

  const tz = effectiveTimeZone(employee.tenant?.timezone);
  const now = DateTime.now().setZone(tz);

  const rows = [];

  for (let i = 0; i < monthsBack; i++) {
    const dt = now.minus({ months: i });
    const y = dt.year;
    const m = dt.month;
    const isCurrentMonth = i === 0;

    let statsPayload;
    if (isCurrentMonth) {
      const { rangeStart, rangeEnd } = calendarMonthRangeInZone(y, m, tz);
      const live = await computeLiveEmployeeAttendanceStats(prisma, {
        tenantId,
        userId,
        rangeStart,
        rangeEnd,
        resolvedPayPeriod: null,
        persistClosedSnapshot: false,
        computedBy,
      });
      if (!live.ok) continue;
      statsPayload = live.responseData;
    } else {
      statsPayload = await ensureMonthlyAttendanceSnapshot(prisma, {
        tenantId,
        userId,
        calendarYear: y,
        calendarMonth: m,
        timeZone: tz,
        computedBy,
      });
      if (!statsPayload) continue;
    }

    rows.push(
      workSummaryRowFromStats(
        "Month",
        `month:${y}-${String(m).padStart(2, "0")}`,
        statsPayload
      )
    );
  }

  if (includePayPeriodRows) {
    const closedPeriods = await prisma.payPeriod.findMany({
      where: { tenantId, status: "CLOSED" },
      orderBy: { endDate: "desc" },
      take: payPeriodsBack,
      select: { id: true, startDate: true, endDate: true, status: true },
    });

    for (const pp of closedPeriods) {
      const data = await statsPayloadForPayPeriod(prisma, tenantId, userId, pp, computedBy);
      if (!data) continue;
      rows.push(workSummaryRowFromStats("Pay period", `payPeriod:${pp.id}`, data));
    }

    const target = new Date();
    const currentPeriod = await prisma.payPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: target },
        endDate: { gte: target },
      },
      orderBy: { startDate: "desc" },
      select: { id: true, startDate: true, endDate: true, status: true },
    });

    if (currentPeriod && currentPeriod.status !== "CLOSED") {
      const data = await statsPayloadForPayPeriod(
        prisma,
        tenantId,
        userId,
        currentPeriod,
        computedBy
      );
      if (data) {
        rows.push(
          workSummaryRowFromStats("Pay period", `payPeriod:${currentPeriod.id}`, data)
        );
      }
    }
  }

  rows.sort((a, b) => b.sortEnd - a.sortEnd);

  const cur = currentCalendarMonthRangeInZone(employee.tenant?.timezone);
  const hoursAgg = await prisma.attendance.findMany({
    where: {
      tenantId,
      userId,
      clockInTime: { gte: cur.rangeStart, lte: cur.rangeEnd },
      clockOutTime: { not: null },
    },
    select: { totalHours: true, clockInTime: true },
  });

  let totalHoursWorked = 0;
  const distinctDays = new Set();
  for (const r of hoursAgg) {
    if (r.totalHours == null || Number.isNaN(Number(r.totalHours))) continue;
    totalHoursWorked += Number(r.totalHours);
    distinctDays.add(new Date(r.clockInTime).toISOString().slice(0, 10));
  }

  // Average only over calendar days that contributed counted hours (no expected-workdays fallback).
  const distinctDaysCount = distinctDays.size;
  const workdaysForAvg = distinctDaysCount;
  const avgDailyHours =
    distinctDaysCount > 0
      ? Math.round((totalHoursWorked / distinctDaysCount) * 100) / 100
      : null;

  const lastIn = await prisma.attendance.findFirst({
    where: { tenantId, userId },
    orderBy: { clockInTime: "desc" },
    select: {
      clockInTime: true,
      location: { select: { name: true } },
    },
  });

  let lastCheckInHHmm = null;
  if (lastIn?.clockInTime) {
    lastCheckInHHmm = DateTime.fromJSDate(new Date(lastIn.clockInTime))
      .setZone(tz)
      .toFormat("HH:mm");
  }

  const monthLabel = now.toFormat("MMM yyyy");

  const publicRows = rows.map(
    ({
      rowKey,
      kind,
      periodType,
      period,
      periodStart,
      periodEnd,
      source,
      presentRate,
      absentRate,
      lateRate,
      overtimeHoursRate,
      noData,
    }) => ({
      rowKey,
      kind,
      periodType,
      period,
      periodStart,
      periodEnd,
      source,
      presentRate,
      absentRate,
      lateRate,
      overtimeHoursRate,
      noData,
    })
  );

  return {
    ok: true,
    data: {
      includesPayPeriodRows: includePayPeriodRows,
      currentMonth: {
        startDate: cur.startDateStr,
        endDate: cur.endDateStr,
        monthLabel,
      },
      header: {
        totalHoursWorked: Math.round(totalHoursWorked * 10) / 10,
        monthLabel,
        avgDailyHours,
        workdaysForAvg,
        lastCheckInHHmm,
        workLocationName: lastIn?.location?.name?.trim() || null,
      },
      rows: publicRows,
    },
  };
}
