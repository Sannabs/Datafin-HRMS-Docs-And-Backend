// utils/attendance-penalty.util.js

import prisma from "../config/prisma.config.js";
import logger from "./logger.js";

const getDatesInRange = (startDate, endDate) => {
  const dates = [];
  const currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (currentDate <= end) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

const formatDateString = (date) => date.toISOString().split("T")[0];

const isWorkDay = (date, workConfig) => {
  const dayMap = {
    0: "sunday",
    1: "monday",
    2: "tuesday",
    3: "wednesday",
    4: "thursday",
    5: "friday",
    6: "saturday",
  };
  return workConfig[dayMap[date.getDay()]] === true;
};

const getHolidaysInRange = async (tenantId, startDate, endDate) => {
  const holidays = await prisma.holiday.findMany({
    where: {
      tenantId,
      isActive: true,
      date: { gte: startDate, lte: endDate },
      OR: [
        { isRecurring: false },
        { isRecurring: true, year: null },
        { isRecurring: true, year: startDate.getFullYear() },
      ],
    },
    select: { date: true },
  });
  return new Set(holidays.map((h) => formatDateString(new Date(h.date))));
};

const findConsecutiveLateSequences = (attendanceByDate) => {
  const sequences = [];
  let currentSequence = [];
  const sortedDates = Object.keys(attendanceByDate).sort();

  for (const dateStr of sortedDates) {
    if (attendanceByDate[dateStr]?.status === "LATE") {
      currentSequence.push(dateStr);
    } else {
      if (currentSequence.length >= 3) sequences.push([...currentSequence]);
      currentSequence = [];
    }
  }
  if (currentSequence.length >= 3) sequences.push(currentSequence);
  return sequences;
};

export const calculateAttendancePenalties = async (
  employeeId,
  tenantId,
  periodStartDate,
  periodEndDate
) => {
  try {
    const [employee, tenant] = await Promise.all([
      prisma.user.findUnique({
        where: { id: employeeId },
        include: { employeeWorkConfig: true },
      }),
      prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { companyWorkDay: true },
      }),
    ]);

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const workConfig = employee?.employeeWorkConfig || tenant?.companyWorkDay;

    if (!workConfig) {
      logger.warn(
        `No work config found for employee ${employeeId} or tenant ${tenantId}`
      );
      throw new Error(
        "Work configuration not found. Please configure employee or company work days."
      );
    }

    const penaltyConfig = {
      absencePenalty: tenant.absencePenalty ?? 0,
      consecutiveLatePenalty: tenant.consecutiveLatePenalty ?? 0,
    };

    return calculateWithConfig(
      employeeId,
      tenantId,
      periodStartDate,
      periodEndDate,
      workConfig,
      penaltyConfig
    );
  } catch (error) {
    logger.error(`Error calculating attendance penalties: ${error.message}`, {
      error: error.stack,
      employeeId,
      tenantId,
    });
    throw error;
  }
};

const calculateWithConfig = async (
  employeeId,
  tenantId,
  periodStartDate,
  periodEndDate,
  workConfig,
  penaltyConfig
) => {
  const { absencePenalty = 0, consecutiveLatePenalty = 0 } = penaltyConfig;

  const allDates = getDatesInRange(periodStartDate, periodEndDate);
  const holidays = await getHolidaysInRange(
    tenantId,
    periodStartDate,
    periodEndDate
  );

  const expectedWorkDays = allDates.filter((date) => {
    const dateStr = formatDateString(date);
    return isWorkDay(date, workConfig) && !holidays.has(dateStr);
  });

  const attendances = await prisma.attendance.findMany({
    where: {
      userId: employeeId,
      tenantId,
      clockInTime: { gte: periodStartDate, lte: periodEndDate },
    },
    select: { id: true, clockInTime: true, status: true },
    orderBy: { clockInTime: "asc" },
  });

  const attendanceByDate = {};
  attendances.forEach((attendance) => {
    attendanceByDate[formatDateString(new Date(attendance.clockInTime))] =
      attendance;
  });

  const absences = expectedWorkDays.filter(
    (date) => !attendanceByDate[formatDateString(date)]
  );
  const consecutiveLateSequences =
    findConsecutiveLateSequences(attendanceByDate);

  const absencePenaltyAmount = absences.length * absencePenalty;
  const consecutiveLatePenaltyAmount =
    consecutiveLateSequences.length * consecutiveLatePenalty;
  const totalPenalty = absencePenaltyAmount + consecutiveLatePenaltyAmount;

  return {
    totalPenalty,
    breakdown: {
      absences: {
        count: absences.length,
        dates: absences.map(formatDateString),
        penaltyAmount: absencePenaltyAmount,
      },
      consecutiveLates: {
        count: consecutiveLateSequences.length,
        sequences: consecutiveLateSequences.map((seq) => ({
          startDate: seq[0],
          endDate: seq[seq.length - 1],
          length: seq.length,
        })),
        penaltyAmount: consecutiveLatePenaltyAmount,
      },
    },
  };
};
