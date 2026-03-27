// patrol.cron.js
import cron from "node-cron";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { getSlotStartsForDate } from "../utils/patrol.util.js";
import {
    sendPatrolSessionDigestEmails,
    processPatrolIntervalReminders,
} from "../services/patrol-notification.service.js";

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
        const createdSessionIds = [];

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

                const row = await prisma.patrolSession.create({
                    data: {
                        patrolScheduleId: schedule.id,
                        assignedUserId: schedule.assignedUserId,
                        slotStart: slot.start,
                        slotEnd: slot.end,
                        status: "IN_PROGRESS",
                        checkpointsTotal: totalCheckpoints,
                    },
                });

                createdSessionIds.push(row.id);
                created++;
            }
        }

        if (createdSessionIds.length > 0) {
            await sendPatrolSessionDigestEmails(createdSessionIds);
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

    // In-app reminders ~10 min before each slot (see PATROL_INTERVAL_REMINDER_MINUTES)
    cron.schedule("*/5 * * * *", processPatrolIntervalReminders);

    logger.info("[PatrolCron] Patrol cron jobs registered");
};

