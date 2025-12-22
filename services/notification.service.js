import prisma from "../config/prisma.config.js";
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
  if (!tenantId || typeof tenantId !== "string") {
    logger.error("Invalid tenantId", tenantId);
    throw new Error("Invalid tenantId");
  }

  if (!userId || typeof userId !== "string") {
    logger.error("Invalid userId", userId);
    throw new Error("Invalid userId");
  }

  if (!VALID_NOTIFICATION_TYPES.includes(type)) {
    logger.error("Invalid notification type", type);
    throw new Error("Invalid notification type");
  }

  if (typeof title !== "string" || title.trim().length === 0) {
    logger.error("Invalid title", title);
    throw new Error("Title is required and cannot be empty");
  }

  if (typeof message !== "string" || message.trim().length === 0) {
    logger.error("Invalid message", message);
    throw new Error("Message is required and cannot be empty");
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        tenantId,
        id: userId,
        isDeleted: false,
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
        title: title.trim(),
        message: message.trim(),
        type,
        actionUrl: actionUrl?.trim() || null,
      },
    });

    logger.info(
      `Notification created successfully for user ${userId}`,
      notification
    );

    return notification;
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
    if (!tenantId || typeof tenantId !== "string") {
      logger.error("Invalid tenantId", tenantId);
      throw new Error("Invalid tenantId");
    }

    const admins = await prisma.user.findMany({
      where: {
        role: "HR_ADMIN",
        tenantId,
        isDeleted: false,
        status: "ACTIVE",
      },
    });

    if (admins.length === 0) {
      logger.warn("No admin users found to notify");
      return { successfully: 0, failed: 0, total: 0 };
    }

    const notification = await Promise.allSettled(
      admins.map((admin) => {
        return createNotification(
          tenantId,
          admin.id,
          title,
          message,
          type,
          actionUrl
        );
      })
    );

    const successfully = notification.filter(
      (n) => n.status === "fulfilled"
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

export const notifyAllHRstaff = async (
  title,
  tenantId,
  message,
  type,
  actionUrl
) => {
  try {
    if (!tenantId || typeof tenantId !== "string") {
      logger.error("Invalid tenantId", tenantId);
      throw new Error("Invalid tenantId");
    }

    const hrStaff = await prisma.user.findMany({
      where: {
        role: "HR_STAFF",
        tenantId,
        isDeleted: false,
        status: "ACTIVE",
      },
    });

    if (hrStaff.length === 0) {
      logger.warn("No HR staff users found to notify");
      return { successfully: 0, failed: 0, total: 0 };
    }

    const notification = await Promise.allSettled(
      hrStaff.map((staff) => {
        return createNotification(
          tenantId,
          staff.id,
          title,
          message,
          type,
          actionUrl
        );
      })
    );

    const successfully = notification.filter(
      (n) => n.status === "fulfilled"
    ).length;

    const failed = notification.filter((n) => n.status === "rejected").length;

    logger.info(
      `Notified ${successfully} HR staff successfully and ${failed} HR staff failed to notify`
    );
    return { successfully, failed, total: hrStaff.length };
  } catch (error) {
    logger.error(`Error notifying HR staff: ${error.message}`, error, {
      stack: error.stack,
    });

    throw error;
  }
};
