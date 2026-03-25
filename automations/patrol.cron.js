// patrol.cron.js
import cron from "node-cron";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

// ---------------------------------------------------------
// Utility: compute all slot windows for a schedule on a given date
// ---------------------------------------------------------
const getSlotStartsForDate = (date, windowStartTime, windowEndTime, intervalHours) => {
    const [startHour, startMin] = windowStartTime.split(":").map(Number);
    const [endHour, endMin] = windowEndTime.split(":").map(Number);

    const windowStart = new Date(date);
    windowStart.setHours(startHour, startMin, 0, 0);

    const windowEnd = new Date(date);
    windowEnd.setHours(endHour, endMin, 0, 0);

    const slots = [];
    const intervalMs = intervalHours * 60 * 60 * 1000;

    let cursor = windowStart.getTime();
    while (cursor < windowEnd.getTime()) {
        const slotStart = new Date(cursor);
        const slotEnd = new Date(cursor + intervalMs);
        slots.push({
            start: slotStart,
            end: slotEnd > windowEnd ? new Date(windowEnd) : slotEnd,
        });
        cursor += intervalMs;
    }

    return slots;
};

// ---------------------------------------------------------
// Job 1: generateUpcomingSessions
// Runs at the top of every hour.
// Creates PatrolSession rows for upcoming/current slots
// that don't exist yet.
// ---------------------------------------------------------
export const generateUpcomingSessions = async () => {
    logger.info("[PatrolCron] generateUpcomingSessions started");

    try {
        const now = new Date();

        const schedules = await prisma.patrolSchedule.findMany({
            where: { isActive: true, deletedAt: null },
            include: {
                patrolSite: {
                    include: {
                        checkpoints: { where: { isActive: true } },
                    },
                },
            },
        });

        let created = 0;
        let skipped = 0;

        for (const schedule of schedules) {
            const totalCheckpoints = schedule.patrolSite.checkpoints.length;

            if (totalCheckpoints === 0) continue;

            const todaySlots = getSlotStartsForDate(
                now,
                schedule.windowStartTime,
                schedule.windowEndTime,
                schedule.intervalHours
            );

            for (const slot of todaySlots) {
                // Skip slots that are fully in the past
                if (slot.end < now) continue;

                const existing = await prisma.patrolSession.findUnique({
                    where: {
                        patrolScheduleId_slotStart: {
                            patrolScheduleId: schedule.id,
                            slotStart: slot.start,
                        },
                    },
                });

                if (existing) {
                    skipped++;
                    continue;
                }

                await prisma.patrolSession.create({
                    data: {
                        patrolScheduleId: schedule.id,
                        assignedUserId: schedule.assignedUserId,
                        slotStart: slot.start,
                        slotEnd: slot.end,
                        status: "IN_PROGRESS",
                        checkpointsTotal: totalCheckpoints,
                    },
                });

                created++;
            }
        }

        logger.info(
            `[PatrolCron] generateUpcomingSessions done — created: ${created}, skipped: ${skipped}`
        );
    } catch (error) {
        logger.error(`[PatrolCron] generateUpcomingSessions error: ${error.message}`, {
            error: error.stack,
        });
    }
};

// ---------------------------------------------------------
// Job 2: closeExpiredSessions
// Runs every 15 minutes.
// Marks stale IN_PROGRESS sessions as INCOMPLETE or MISSED.
// ---------------------------------------------------------
export const closeExpiredSessions = async () => {
    logger.info("[PatrolCron] closeExpiredSessions started");

    try {
        const now = new Date();

        const expiredSessions = await prisma.patrolSession.findMany({
            where: {
                status: "IN_PROGRESS",
                slotEnd: { lt: now },
            },
        });

        let missed = 0;
        let incomplete = 0;

        for (const session of expiredSessions) {
            if (session.startedAt === null) {
                await prisma.patrolSession.update({
                    where: { id: session.id },
                    data: { status: "MISSED" },
                });
                missed++;
            } else {
                await prisma.patrolSession.update({
                    where: { id: session.id },
                    data: { status: "INCOMPLETE" },
                });
                incomplete++;
            }
        }

        logger.info(
            `[PatrolCron] closeExpiredSessions done — missed: ${missed}, incomplete: ${incomplete}`
        );
    } catch (error) {
        logger.error(`[PatrolCron] closeExpiredSessions error: ${error.message}`, {
            error: error.stack,
        });
    }
};

// ---------------------------------------------------------
// Register cron jobs — call this in your app startup
// ---------------------------------------------------------
export const registerPatrolCrons = () => {
    // Generate sessions at the top of every hour
    cron.schedule("0 * * * *", generateUpcomingSessions);

    // Close expired sessions every 15 minutes
    cron.schedule("*/15 * * * *", closeExpiredSessions);

    logger.info("[PatrolCron] Patrol cron jobs registered");
};

