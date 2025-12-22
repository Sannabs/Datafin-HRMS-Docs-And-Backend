import logger from "../utils/logger.js";
import prisma from "../config/prisma.config.js";

const VALID_NOTIFICATION_TYPES = [
  "PAYROLL",
  "ATTENDANCE",
  "LEAVE",
  "PERFORMANCE",
  "ACTIVITIES",
  "OTHER",
];

export const getUserNotifications = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const page = parseInt(req.query.page || 1);
    const limit = Math.min(parseInt(req.query.limit || 10), 100);
    const skip = (page - 1) * limit;
    const readStatus =
      req.query.readStatus !== undefined
        ? req.query.readStatus === "true"
        : undefined;
    const type = req.query.type;

    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    const where = {
      tenantId,
      userId,
    };

    if (readStatus !== undefined) {
      where.readStatus = readStatus;
    }

    if (type && VALID_NOTIFICATION_TYPES.includes(type)) {
      where.type = type;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.notification.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return res.status(200).json({
      success: true,
      data: notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    });
  } catch (error) {
    logger.error(`Error in getUserNotifications controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};

export const getUnreadNotificationCount = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;

    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    const count = await prisma.notification.count({
      where: {
        tenantId,
        userId,
        readStatus: false,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        unreadCount: count,
      },
    });
  } catch (error) {
    logger.error(
      `Error in getUnreadNotificationCount controller: ${error.message}`,
      {
        stack: error.stack,
      }
    );
    next(error);
  }
};

export const markNotificationAsRead = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id);

    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    if (isNaN(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
        userId,
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    const updatedNotification = await prisma.notification.update({
      where: {
        id: notificationId,
      },
      data: {
        readStatus: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: updatedNotification,
    });
  } catch (error) {
    logger.error(
      `Error in markNotificationAsRead controller: ${error.message}`,
      {
        stack: error.stack,
      }
    );
    next(error);
  }
};

export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;

    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    const result = await prisma.notification.updateMany({
      where: {
        tenantId,
        userId,
        readStatus: false,
      },
      data: {
        readStatus: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Marked ${result.count} notifications as read`,
      data: { count: result.count },
    });
  } catch (error) {
    logger.error(
      `Error in markAllNotificationsAsRead controller: ${error.message}`,
      {
        stack: error.stack,
      }
    );
    next(error);
  }
};

export const deleteUserNotification = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id);

    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    if (isNaN(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID",
      });
    }

    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        tenantId,
        userId,
      },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    const deletedNotification = await prisma.notification.delete({
      where: {
        id: notificationId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
      data: deletedNotification,
    });
  } catch (error) {
    logger.error(
      `Error in deleteUserNotification controller: ${error.message}`,
      {
        stack: error.stack,
      }
    );
    next(error);
  }
};
