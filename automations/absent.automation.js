import cron from "node-cron";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

// run every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  const startTime = Date.now();
  const now = new Date();
  const currentDay = getDayName(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  logger.info(
    `[Absent Automation] Starting absent marking job at ${now.toISOString()}`
  );

  try {
    const employees = await prisma.user.findMany({
      where: {
        shiftId: { not: null },
        status: "ACTIVE",
        isDeleted: false,
      },
      include: {
        shift: true,
        employeeWorkConfig: true,
        tenant: { include: { companyWorkDay: true } },
      },
    });

    logger.info(
      `[Absent Automation] Found ${employees.length} employees with shifts to check`
    );

    let checkedCount = 0;
    let skippedNotWorkDay = 0;
    let skippedShiftOngoing = 0;
    let skippedHasAttendance = 0;
    let markedAbsent = 0;
    let errors = 0;

    for (const employee of employees) {
      try {
        checkedCount++;

        const shouldWork = employee.employeeWorkConfig
          ? employee.employeeWorkConfig[currentDay]
          : employee.tenant?.companyWorkDay?.[currentDay] ?? false;

        if (!shouldWork) {
          skippedNotWorkDay++;
          continue;
        }

        const shiftEnded = checkIfShiftEnded(
          employee.shift,
          now,
          currentMinutes
        );

        if (!shiftEnded) {
          skippedShiftOngoing++;
          continue;
        }

        const window = getShiftAttendanceWindow(employee.shift, now);

        // Any real clock-in in the window, or an automated ABSENT already recorded for this shift window
        const attendance = await prisma.attendance.findFirst({
          where: {
            userId: employee.id,
            OR: [
              {
                clockInTime: {
                  gte: window.start,
                  lte: window.end,
                },
              },
              {
                status: "ABSENT",
                clockInTime: null,
                createdAt: {
                  gte: window.start,
                  lte: now,
                },
              },
            ],
          },
        });

        if (attendance) {
          skippedHasAttendance++;
          continue;
        }

        await prisma.attendance.create({
          data: {
            userId: employee.id,
            tenantId: employee.tenantId,
            status: "ABSENT",
            notes: `Marked absent - ${employee.shift.name} (${employee.shift.startTime}-${employee.shift.endTime})`,
          },
        });

        markedAbsent++;
        logger.info(
          `[Absent Automation] Marked employee ${employee.id} (${employee.name || employee.email
          }) as absent for shift ${employee.shift.name}`
        );
      } catch (error) {
        errors++;
        logger.error(
          `[Absent Automation] Error processing employee ${employee.id}: ${error.message}`,
          { stack: error.stack, employeeId: employee.id }
        );
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      `[Absent Automation] Job completed in ${duration}ms. Stats: ${checkedCount} checked, ${markedAbsent} marked absent, ${skippedNotWorkDay} skipped (not work day), ${skippedShiftOngoing} skipped (shift ongoing), ${skippedHasAttendance} skipped (has attendance), ${errors} errors`
    );
  } catch (error) {
    logger.error(
      `[Absent Automation] Fatal error in absent marking job: ${error.message}`,
      {
        stack: error.stack,
      }
    );
  }
});

function checkIfShiftEnded(shift, currentTime, currentMinutes) {
  const startMinutes = parseTimeToMinutes(shift.startTime);
  const endMinutes = parseTimeToMinutes(shift.endTime);

  // Night shift (crosses midnight)
  if (endMinutes < startMinutes) {
    if (currentMinutes >= startMinutes) {
      return false; // Shift ongoing (10pm-11:59pm)
    }
    return currentMinutes >= endMinutes; // Check if past end time (12am-6am)
  }

  // Normal shift
  return currentMinutes >= endMinutes;
}

function getShiftAttendanceWindow(shift, currentTime) {
  const startMinutes = parseTimeToMinutes(shift.startTime);
  const endMinutes = parseTimeToMinutes(shift.endTime);

  // Night shift
  if (endMinutes < startMinutes) {
    const start = new Date(currentTime);
    start.setDate(start.getDate() - 1); // Yesterday
    const [startHour, startMin] = shift.startTime.split(":").map(Number);
    start.setHours(startHour, startMin, 0, 0);

    const end = new Date(currentTime);
    const [endHour, endMin] = shift.endTime.split(":").map(Number);
    end.setHours(endHour, endMin, 0, 0);

    return { start, end };
  }

  // Normal shift
  const start = new Date(currentTime);
  start.setHours(0, 0, 0, 0);

  const end = new Date(currentTime);

  return { start, end };
}

function parseTimeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(":").map(Number);
  return hours * 60 + minutes;
}

function getDayName(date) {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  return days[date.getDay()];
}
