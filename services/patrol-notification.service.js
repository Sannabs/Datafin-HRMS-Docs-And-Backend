import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { createNotification } from "./notification.service.js";
import { sendPatrolSessionsScheduledEmail } from "../views/sendPatrolSessionsScheduledEmail.js";

/** In-app reminder window: notify when slot starts within this many minutes (and not yet started). */
export const PATROL_INTERVAL_REMINDER_MINUTES = 10;

function formatSlotRange(slotStart, slotEnd) {
  const s = new Date(slotStart);
  const e = new Date(slotEnd);
  const opts = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  return `${s.toLocaleString(undefined, opts)} – ${e.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

/**
 * After cron creates sessions: one digest email per user (only if they have an email).
 * @param {string[]} createdSessionIds
 */
export async function sendPatrolSessionDigestEmails(createdSessionIds) {
  if (!createdSessionIds.length) return { sent: 0, skipped: 0 };

  const sessions = await prisma.patrolSession.findMany({
    where: { id: { in: createdSessionIds } },
    include: {
      patrolSchedule: { include: { patrolSite: true } },
      assignedUser: {
        select: { id: true, email: true, name: true, tenantId: true },
      },
    },
  });

  /** @type {Map<string, typeof sessions>} */
  const byUser = new Map();
  for (const s of sessions) {
    const key = `${s.assignedUser.tenantId}::${s.assignedUserId}`;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key).push(s);
  }

  let sent = 0;
  let skipped = 0;

  for (const list of byUser.values()) {
    const user = list[0].assignedUser;
    if (!user.email || !String(user.email).trim()) {
      skipped += list.length;
      continue;
    }

    const rounds = list.map((sess) => ({
      siteName: sess.patrolSchedule.patrolSite.name,
      scheduleName: sess.patrolSchedule.name,
      slotLabel: formatSlotRange(sess.slotStart, sess.slotEnd),
    }));

    try {
      await sendPatrolSessionsScheduledEmail({
        to: user.email.trim(),
        employeeName: user.name || "there",
        rounds,
      });
      sent++;
    } catch (err) {
      logger.error(
        `[PatrolNotify] Digest email failed for user ${user.id}: ${err.message}`,
        { stack: err.stack }
      );
    }
  }

  logger.info(
    `[PatrolNotify] Session digest emails — sent: ${sent} user(s), skipped (no email): ${skipped} session row(s)`
  );
  return { sent, skipped };
}

/**
 * Cron: in-app notification ~10 minutes before slot start (first time only per session).
 * Runs every few minutes; sends when slotStart is between now and now+10min.
 */
export async function processPatrolIntervalReminders() {
  const now = new Date();
  const windowEnd = new Date(
    now.getTime() + PATROL_INTERVAL_REMINDER_MINUTES * 60 * 1000
  );

  const sessions = await prisma.patrolSession.findMany({
    where: {
      status: "IN_PROGRESS",
      intervalReminderSentAt: null,
      slotStart: { gt: now, lte: windowEnd },
    },
    include: {
      patrolSchedule: { include: { patrolSite: true } },
    },
  });

  let notified = 0;
  for (const session of sessions) {
    const siteName = session.patrolSchedule.patrolSite.name;
    const tenantId = session.patrolSchedule.tenantId;
    const slotLabel = formatSlotRange(session.slotStart, session.slotEnd);

    try {
      await createNotification(
        tenantId,
        session.assignedUserId,
        "Patrol round starting soon",
        `${siteName}: your window begins at ${slotLabel}.`,
        "PATROL",
        null
      );
      await prisma.patrolSession.update({
        where: { id: session.id },
        data: { intervalReminderSentAt: now },
      });
      notified++;
    } catch (err) {
      logger.error(
        `[PatrolNotify] Interval reminder failed for session ${session.id}: ${err.message}`,
        { stack: err.stack }
      );
    }
  }

  if (notified > 0) {
    logger.info(`[PatrolNotify] Interval reminders sent: ${notified}`);
  }
}
