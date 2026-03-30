import { DateTime } from "luxon";

/**
 * @param {string | null | undefined} raw
 * @returns {string}
 */
export function effectiveTimeZone(raw) {
  if (!raw || typeof raw !== "string" || !raw.trim()) return "UTC";
  const z = raw.trim();
  try {
    Intl.DateTimeFormat(undefined, { timeZone: z });
    return z;
  } catch {
    return "UTC";
  }
}

/**
 * Current calendar month [start,end] in tenant zone (wall-time aligned for queries).
 * @param {string | null | undefined} tenantTimeZone
 */
export function currentCalendarMonthRangeInZone(tenantTimeZone) {
  const tz = effectiveTimeZone(tenantTimeZone);
  const now = DateTime.now().setZone(tz);
  return calendarMonthRangeInZone(now.year, now.month, tz);
}

/**
 * @param {number} year
 * @param {number} month1to12
 * @param {string} timeZone IANA
 */
export function calendarMonthRangeInZone(year, month1to12, timeZone) {
  const tz = effectiveTimeZone(timeZone);
  const start = DateTime.fromObject({ year, month: month1to12, day: 1 }, { zone: tz }).startOf("day");
  const end = start.endOf("month").endOf("day");
  const rangeStart = start.toJSDate();
  const rangeEnd = end.toJSDate();
  rangeStart.setHours(0, 0, 0, 0);
  rangeEnd.setHours(23, 59, 59, 999);
  return {
    rangeStart,
    rangeEnd,
    startDateStr: start.toFormat("yyyy-MM-dd"),
    endDateStr: end.toFormat("yyyy-MM-dd"),
    year,
    month: month1to12,
  };
}

/**
 * @param {import("@prisma/client").AttendanceStatSnapshot} existingSnapshot
 * @param {string} payPeriodId
 */
export function payPeriodSnapshotToStatsData(existingSnapshot, payPeriodId) {
  const noData = existingSnapshot.observedAttendanceDays === 0;
  return {
    totalDays: noData ? 0 : existingSnapshot.observedAttendanceDays,
    observedAttendanceDays: noData ? 0 : existingSnapshot.observedAttendanceDays,
    expectedWorkdays: existingSnapshot.expectedWorkdays,
    effectiveExpectedWorkdays: existingSnapshot.effectiveExpectedWorkdays,
    expectedWorkHours: noData ? 0 : existingSnapshot.expectedWorkHours,
    denominatorType: "EFFECTIVE_EXPECTED_WORKDAYS",
    period: {
      startDate: new Date(existingSnapshot.periodStartDate).toISOString().slice(0, 10),
      endDate: new Date(existingSnapshot.periodEndDate).toISOString().slice(0, 10),
    },
    presentCount: noData ? 0 : existingSnapshot.presentCount,
    absentCount: noData ? 0 : existingSnapshot.absentCount,
    lateCount: noData ? 0 : existingSnapshot.lateCount,
    excusedAbsenceCount: existingSnapshot.excusedAbsenceCount,
    overtimeDaysCount: noData ? 0 : existingSnapshot.overtimeDaysCount,
    overtimeHoursTotal: noData ? 0 : existingSnapshot.overtimeHoursTotal,
    presentRate: noData ? 0 : existingSnapshot.presentRate,
    absentRate: noData ? 0 : existingSnapshot.absentRate,
    lateRate: noData ? 0 : existingSnapshot.lateRate,
    overtimeRate: noData ? 0 : existingSnapshot.overtimeRate,
    overtimeHoursRate: noData ? 0 : existingSnapshot.overtimeHoursRate,
    noData,
    snapshot: true,
    payPeriodId,
  };
}

/**
 * @param {import("@prisma/client").MonthlyAttendanceStatSnapshot} row
 */
export function monthlySnapshotToStatsData(row) {
  const noData = row.observedAttendanceDays === 0;
  return {
    totalDays: noData ? 0 : row.observedAttendanceDays,
    observedAttendanceDays: noData ? 0 : row.observedAttendanceDays,
    expectedWorkdays: row.expectedWorkdays,
    effectiveExpectedWorkdays: row.effectiveExpectedWorkdays,
    expectedWorkHours: noData ? 0 : row.expectedWorkHours,
    denominatorType: "EFFECTIVE_EXPECTED_WORKDAYS",
    period: {
      startDate: new Date(row.periodStartDate).toISOString().slice(0, 10),
      endDate: new Date(row.periodEndDate).toISOString().slice(0, 10),
    },
    presentCount: noData ? 0 : row.presentCount,
    absentCount: noData ? 0 : row.absentCount,
    lateCount: noData ? 0 : row.lateCount,
    excusedAbsenceCount: row.excusedAbsenceCount,
    overtimeDaysCount: noData ? 0 : row.overtimeDaysCount,
    overtimeHoursTotal: noData ? 0 : row.overtimeHoursTotal,
    presentRate: noData ? 0 : row.presentRate,
    absentRate: noData ? 0 : row.absentRate,
    lateRate: noData ? 0 : row.lateRate,
    overtimeRate: noData ? 0 : row.overtimeRate,
    overtimeHoursRate: noData ? 0 : row.overtimeHoursRate,
    noData,
    snapshot: true,
  };
}

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") return null;
  const [hRaw, mRaw] = timeStr.split(":");
  const h = Number.parseInt(String(hRaw), 10);
  const m = Number.parseInt(String(mRaw), 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

const computeShiftHours = (shift) => {
  const startMin = parseTimeToMinutes(shift?.startTime);
  const endMin = parseTimeToMinutes(shift?.endTime);
  if (startMin == null || endMin == null) return null;
  let diff = endMin - startMin;
  if (diff <= 0) diff += 24 * 60;
  return diff / 60;
};

/**
 * First calendar day the employee should appear in stats (hire date, else account created), tenant wall time.
 * @param {Date | null | undefined} hireDate
 * @param {Date} createdAt
 * @param {string} tz
 * @returns {DateTime | null}
 */
function employeeStatsEligibilityStartLuxon(hireDate, createdAt, tz) {
  const raw = hireDate ?? createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  const dt = DateTime.fromISO(iso, { zone: tz }).startOf("day");
  return dt.isValid ? dt : null;
}

/**
 * @param {import("luxon").DateTime} effStartLuxon
 * @param {import("luxon").DateTime} effEndLuxon
 * @returns {{ rangeStartEff: Date, rangeEndEff: Date }}
 */
function luxonBoundsToPrismaRange(effStartLuxon, effEndLuxon) {
  const rangeStartEff = effStartLuxon.startOf("day").toJSDate();
  rangeStartEff.setHours(0, 0, 0, 0);
  const rangeEndEff = effEndLuxon.endOf("day").toJSDate();
  rangeEndEff.setHours(23, 59, 59, 999);
  return { rangeStartEff, rangeEndEff };
}

/**
 * Live stats for a date range (and optional pay period metadata).
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   tenantId: string,
 *   userId: string,
 *   rangeStart: Date,
 *   rangeEnd: Date,
 *   resolvedPayPeriod: { id: string, status: string } | null,
 *   persistClosedSnapshot?: boolean,
 *   computedBy?: string | null,
 * }} args
 * @returns {Promise<{ ok: true, responseData: object } | { ok: false, code: string }>}
 */
export async function computeLiveEmployeeAttendanceStats(prisma, args) {
  const {
    tenantId,
    userId,
    rangeStart,
    rangeEnd,
    resolvedPayPeriod,
    persistClosedSnapshot = false,
    computedBy = null,
  } = args;

  const employee = await prisma.user.findFirst({
    where: { id: userId, tenantId, isDeleted: false },
    select: {
      id: true,
      shiftId: true,
      hireDate: true,
      createdAt: true,
      tenant: {
        select: {
          weekendDays: true,
          timezone: true,
        },
      },
    },
  });

  if (!employee) {
    return { ok: false, code: "EMPLOYEE_NOT_FOUND" };
  }

  const tz = effectiveTimeZone(employee.tenant?.timezone);
  const rangeStartLuxon = DateTime.fromJSDate(rangeStart, { zone: tz }).startOf("day");
  const rangeEndLuxon = DateTime.fromJSDate(rangeEnd, { zone: tz }).endOf("day");

  const eligibilityLuxon = employeeStatsEligibilityStartLuxon(
    employee.hireDate,
    employee.createdAt,
    tz
  );
  let effStartLuxon = rangeStartLuxon;
  if (eligibilityLuxon && eligibilityLuxon > effStartLuxon) {
    effStartLuxon = eligibilityLuxon;
  }

  const capEndAtToday = !persistClosedSnapshot;
  let effEndLuxon = rangeEndLuxon;
  if (capEndAtToday) {
    const todayEndLuxon = DateTime.now().setZone(tz).endOf("day");
    if (effEndLuxon > todayEndLuxon) effEndLuxon = todayEndLuxon;
  }

  if (effStartLuxon > effEndLuxon) {
    return {
      ok: true,
      responseData: {
        totalDays: 0,
        observedAttendanceDays: 0,
        expectedWorkdays: 0,
        effectiveExpectedWorkdays: 0,
        expectedWorkHours: 0,
        denominatorType: "EFFECTIVE_EXPECTED_WORKDAYS",
        period: {
          startDate: effStartLuxon.toFormat("yyyy-MM-dd"),
          endDate: effEndLuxon.toFormat("yyyy-MM-dd"),
        },
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        excusedAbsenceCount: 0,
        overtimeDaysCount: 0,
        overtimeHoursTotal: 0,
        presentRate: 0,
        absentRate: 0,
        lateRate: 0,
        overtimeRate: 0,
        overtimeHoursRate: 0,
        noData: true,
        ...(resolvedPayPeriod?.id ? { payPeriodId: resolvedPayPeriod.id } : {}),
      },
    };
  }

  const { rangeStartEff, rangeEndEff } = luxonBoundsToPrismaRange(effStartLuxon, effEndLuxon);

  const where = {
    tenantId,
    userId,
    clockInTime: {
      gte: rangeStartEff,
      lte: rangeEndEff,
    },
  };

  const [attendanceRows, excusedRows, employeeWorkConfig, companyWorkDay, holidays, shiftRow, defaultShiftRow] =
    await Promise.all([
      prisma.attendance.findMany({
        where,
        select: {
          clockInTime: true,
          status: true,
          overtimeHours: true,
        },
      }),
      prisma.attendanceException.findMany({
        where: {
          tenantId,
          userId,
          type: "EXCUSED_ABSENCE",
          isActive: true,
          date: {
            gte: rangeStartEff,
            lte: rangeEndEff,
          },
        },
        select: { date: true },
      }),
      prisma.employeeWorkConfig.findUnique({
        where: { userId },
        select: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true,
        },
      }),
      prisma.companyWorkDay.findUnique({
        where: { tenantId },
        select: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true,
        },
      }),
      prisma.holiday.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            {
              isRecurring: false,
              date: {
                gte: rangeStartEff,
                lte: rangeEndEff,
              },
            },
            { isRecurring: true },
          ],
        },
        select: {
          date: true,
          isRecurring: true,
          year: true,
        },
      }),
      employee.shiftId
        ? prisma.shift.findFirst({
            where: { id: employee.shiftId, tenantId, isActive: true },
            select: { startTime: true, endTime: true },
          })
        : Promise.resolve(null),
      prisma.shift.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
        select: { startTime: true, endTime: true },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  const dayMap = new Map();
  for (const row of attendanceRows) {
    const dayKey = new Date(row.clockInTime).toISOString().slice(0, 10);
    const existing = dayMap.get(dayKey) ?? {
      hasPresent: false,
      hasLate: false,
      hasAbsent: false,
      hasOvertime: false,
      overtimeHoursTotal: 0,
    };

    if (row.status === "ON_TIME" || row.status === "EARLY") existing.hasPresent = true;
    if (row.status === "LATE") existing.hasLate = true;
    if (row.status === "ABSENT") existing.hasAbsent = true;
    if (Number(row.overtimeHours ?? 0) > 0) existing.hasOvertime = true;
    existing.overtimeHoursTotal += Number(row.overtimeHours ?? 0);

    dayMap.set(dayKey, existing);
  }

  const tenantWeekendSet = new Set(employee?.tenant?.weekendDays ?? [0, 6]);
  const companyWorkdayByDow = companyWorkDay
    ? {
        0: companyWorkDay.sunday,
        1: companyWorkDay.monday,
        2: companyWorkDay.tuesday,
        3: companyWorkDay.wednesday,
        4: companyWorkDay.thursday,
        5: companyWorkDay.friday,
        6: companyWorkDay.saturday,
      }
    : null;
  const employeeWorkdayByDow = employeeWorkConfig
    ? {
        0: employeeWorkConfig.sunday,
        1: employeeWorkConfig.monday,
        2: employeeWorkConfig.tuesday,
        3: employeeWorkConfig.wednesday,
        4: employeeWorkConfig.thursday,
        5: employeeWorkConfig.friday,
        6: employeeWorkConfig.saturday,
      }
    : null;
  const isConfiguredWorkday = (date) => {
    const dow = date.getDay();
    if (employeeWorkdayByDow) return Boolean(employeeWorkdayByDow[dow]);
    if (companyWorkdayByDow) return Boolean(companyWorkdayByDow[dow]);
    return !tenantWeekendSet.has(dow);
  };

  const oneTimeHolidaySet = new Set();
  const recurringHolidaySet = new Set();
  for (const holiday of holidays) {
    const d = new Date(holiday.date);
    const monthDay = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (holiday.isRecurring) {
      if (holiday.year == null) recurringHolidaySet.add(monthDay);
    } else {
      oneTimeHolidaySet.add(d.toISOString().slice(0, 10));
    }
  }
  const isHoliday = (date) => {
    const dayKey = date.toISOString().slice(0, 10);
    if (oneTimeHolidaySet.has(dayKey)) return true;
    const monthDay = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return recurringHolidaySet.has(monthDay);
  };

  const expectedDayKeys = [];
  for (const d = new Date(rangeStartEff); d <= rangeEndEff; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    if (!isConfiguredWorkday(day)) continue;
    if (isHoliday(day)) continue;
    expectedDayKeys.push(day.toISOString().slice(0, 10));
  }

  const excusedSet = new Set(
    excusedRows.map((item) => new Date(item.date).toISOString().slice(0, 10))
  );

  let present = 0;
  let late = 0;
  let absent = 0;
  let overtimeDays = 0;
  let overtimeHoursTotal = 0;
  for (const dayKey of expectedDayKeys) {
    const day = dayMap.get(dayKey);

    if (excusedSet.has(dayKey)) {
      // excluded from absent numerator
    } else if (!day || (!day.hasAbsent && !day.hasLate && !day.hasPresent)) {
      absent += 1;
    } else if (day.hasAbsent) {
      absent += 1;
    } else if (day.hasLate) {
      late += 1;
    } else if (day.hasPresent) {
      present += 1;
    }

    if (day?.hasOvertime) overtimeDays += 1;
    overtimeHoursTotal += day?.overtimeHoursTotal ?? 0;
  }

  const observedAttendanceDays = dayMap.size;
  const expectedWorkdays = expectedDayKeys.length;
  const excusedAbsenceCount = expectedDayKeys.reduce(
    (acc, key) => acc + (excusedSet.has(key) ? 1 : 0),
    0
  );
  const effectiveExpectedWorkdays = Math.max(0, expectedWorkdays - excusedAbsenceCount);
  const rate = (count) =>
    effectiveExpectedWorkdays > 0
      ? Math.round(((count / effectiveExpectedWorkdays) * 100) * 10) / 10
      : 0;

  const expectedHoursPerDay =
    computeShiftHours(shiftRow) ?? computeShiftHours(defaultShiftRow) ?? 8;
  const expectedWorkHoursRaw = effectiveExpectedWorkdays * expectedHoursPerDay;
  const expectedWorkHours = Math.round(expectedWorkHoursRaw * 10) / 10;
  const overtimeHoursRate =
    expectedWorkHours > 0
      ? Math.round(((overtimeHoursTotal / expectedWorkHours) * 100) * 10) / 10
      : 0;

  const insufficientAttendanceForRates =
    observedAttendanceDays === 0 && effectiveExpectedWorkdays > 0;

  let presentOut = present;
  let lateOut = late;
  let absentOut = absent;
  let overtimeDaysOut = overtimeDays;
  let overtimeHoursTotalOut = overtimeHoursTotal;
  if (insufficientAttendanceForRates) {
    presentOut = 0;
    lateOut = 0;
    absentOut = 0;
    overtimeDaysOut = 0;
    overtimeHoursTotalOut = 0;
  }

  const presentRateOut = insufficientAttendanceForRates ? 0 : rate(presentOut);
  const absentRateOut = insufficientAttendanceForRates ? 0 : rate(absentOut);
  const lateRateOut = insufficientAttendanceForRates ? 0 : rate(lateOut);
  const overtimeRateOut = insufficientAttendanceForRates ? 0 : rate(overtimeDaysOut);
  const overtimeHoursRateOut = insufficientAttendanceForRates
    ? 0
    : overtimeHoursRate;
  const expectedWorkHoursOut = insufficientAttendanceForRates
    ? 0
    : expectedWorkHours;

  const observedAttendanceDaysOut = insufficientAttendanceForRates
    ? 0
    : observedAttendanceDays;
  const noData = observedAttendanceDaysOut === 0;

  const responseData = {
    totalDays: observedAttendanceDaysOut,
    observedAttendanceDays: observedAttendanceDaysOut,
    expectedWorkdays,
    effectiveExpectedWorkdays,
    expectedWorkHours: expectedWorkHoursOut,
    denominatorType: "EFFECTIVE_EXPECTED_WORKDAYS",
    period: {
      startDate: effStartLuxon.toFormat("yyyy-MM-dd"),
      endDate: effEndLuxon.toFormat("yyyy-MM-dd"),
    },
    presentCount: presentOut,
    absentCount: absentOut,
    lateCount: lateOut,
    excusedAbsenceCount,
    overtimeDaysCount: overtimeDaysOut,
    overtimeHoursTotal: Math.round(overtimeHoursTotalOut * 10) / 10,
    presentRate: presentRateOut,
    absentRate: absentRateOut,
    lateRate: lateRateOut,
    overtimeRate: overtimeRateOut,
    overtimeHoursRate: overtimeHoursRateOut,
    noData,
    ...(resolvedPayPeriod?.id ? { payPeriodId: resolvedPayPeriod.id } : {}),
  };

  if (persistClosedSnapshot && resolvedPayPeriod?.status === "CLOSED") {
    await prisma.attendanceStatSnapshot.create({
      data: {
        tenantId,
        userId,
        payPeriodId: resolvedPayPeriod.id,
        periodStartDate: rangeStartEff,
        periodEndDate: rangeEndEff,
        expectedWorkdays,
        effectiveExpectedWorkdays,
        observedAttendanceDays: observedAttendanceDaysOut,
        presentCount: presentOut,
        lateCount: lateOut,
        absentCount: absentOut,
        excusedAbsenceCount,
        overtimeDaysCount: overtimeDaysOut,
        overtimeHoursTotal: Math.round(overtimeHoursTotalOut * 10) / 10,
        expectedWorkHours: expectedWorkHoursOut,
        presentRate: presentRateOut,
        lateRate: lateRateOut,
        absentRate: absentRateOut,
        overtimeRate: overtimeRateOut,
        overtimeHoursRate: overtimeHoursRateOut,
        computedBy: computedBy ?? null,
      },
    });
    responseData.snapshot = true;
  }

  return { ok: true, responseData };
}

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{
 *   tenantId: string,
 *   userId: string,
 *   calendarYear: number,
 *   calendarMonth: number,
 *   timeZone: string,
 *   computedBy?: string | null,
 * }} args
 */
export async function ensureMonthlyAttendanceSnapshot(prisma, args) {
  const { tenantId, userId, calendarYear, calendarMonth, timeZone, computedBy = null } = args;
  const existing = await prisma.monthlyAttendanceStatSnapshot.findFirst({
    where: { tenantId, userId, calendarYear, calendarMonth },
  });
  if (existing) {
    return monthlySnapshotToStatsData(existing);
  }

  const { rangeStart, rangeEnd } = calendarMonthRangeInZone(calendarYear, calendarMonth, timeZone);
  const live = await computeLiveEmployeeAttendanceStats(prisma, {
    tenantId,
    userId,
    rangeStart,
    rangeEnd,
    resolvedPayPeriod: null,
    persistClosedSnapshot: false,
    computedBy,
  });
  if (!live.ok) return null;

  const d = live.responseData;
  const snapTz = effectiveTimeZone(timeZone);
  const periodStartPersist = DateTime.fromISO(d.period.startDate, { zone: snapTz })
    .startOf("day")
    .toJSDate();
  const periodEndPersist = DateTime.fromISO(d.period.endDate, { zone: snapTz })
    .endOf("day")
    .toJSDate();

  await prisma.monthlyAttendanceStatSnapshot.create({
    data: {
      tenantId,
      userId,
      calendarYear,
      calendarMonth,
      periodStartDate: periodStartPersist,
      periodEndDate: periodEndPersist,
      expectedWorkdays: d.expectedWorkdays,
      effectiveExpectedWorkdays: d.effectiveExpectedWorkdays,
      observedAttendanceDays: d.observedAttendanceDays,
      presentCount: d.presentCount,
      lateCount: d.lateCount,
      absentCount: d.absentCount,
      excusedAbsenceCount: d.excusedAbsenceCount,
      overtimeDaysCount: d.overtimeDaysCount,
      overtimeHoursTotal: d.overtimeHoursTotal,
      expectedWorkHours: d.expectedWorkHours ?? 0,
      presentRate: d.presentRate,
      lateRate: d.lateRate,
      absentRate: d.absentRate,
      overtimeRate: d.overtimeRate,
      overtimeHoursRate: d.overtimeHoursRate ?? 0,
      computedBy: computedBy ?? null,
    },
  });

  return { ...d, snapshot: true };
}
