import { prisma } from "../config/prisma.config.js";
import logger from "../utils/logger.js";

const VALID_NOTIFICATION_TYPES = [
  "PAYROLL",
  "ATTENDANCE",
  "LEAVE",
  "PERFORMANCE",
  "ACTIVITIES",
  "OTHER",
];

export const createNotification = async (
  tenantId,
  userId,
  title,
  message,
  type,
  actionUrl
) => {
  if (!userId || typeof userId !== "string") {
    logger.error("Invalid userId", userId);
    throw new Error("Invalid userId");
  }

  if (!VALID_NOTIFICATION_TYPES.includes(type)) {
    logger.error("Invalid notification type", type);
    throw new Error("Invalid notification type");
  }

  if (!typeof title !== "string" || title.trim().length === 0) {
    logger.error("Invalid title", title);
    throw new Error("Title is required and cannot be empty");
  }

  if (!typeof message !== "string" || message.trim().length === 0) {
    logger.error("Invalid message", message);
    throw new Error("Message is required and cannot be empty");
  }

  try {
    const user = await prisma.user.findUnique({
      where: {
        tenantId,
        id: userId,
      },
    });

    if (!user) {
      logger.error("User not found", userId);
      throw new Error("User not found");
    }

    const notification = await prisma.notification.create({
      data: {
        tenantId,
        userId,
        title,
        message,
        type,
        actionUrl,
      },
    });

    logger.info(
      `Notification created successfully for user ${userId}`,
      notification
    );
  } catch (error) {
    logger.error(`Error creating notification: ${error.message}`, error, {
      stack: error.stack,
    });

    throw error;
  }
};

export const notifyAllAdmins = async (
  title,
  tenantId,
  message,
  type,
  actionUrl
) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: "HR_ADMIN",
        tenantId,
        isDeleted: false,
        status: "ACTIVE",
      },
    });

    if (admins.length === 0) {
      logger.warn("No admins user founds to notify");
    }

    const notification = await Promise.allSettled(
      admins.map((admin) => {
        createNotification(tenantId, admin.id, title, message, type, actionUrl);
      })
    );

    const successfully = notification.filter(
      (n = n.status === "fulfilled")
    ).length;

    const failed = notification.filter((n) => n.status === "rejected").length;

    logger.info(
      `Notified ${successfully} admins successfully and ${failed} admins failed to notify`
    );
    return { successfully, failed, total: admins.length };
  } catch (error) {
    logger.error(`Error notifying admins: ${error.message}`, error, {
      stack: error.stack,
    });

    throw error;
  }
};
