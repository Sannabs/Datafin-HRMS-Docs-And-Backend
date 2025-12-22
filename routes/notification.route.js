import express from "express";
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteUserNotification,
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.use(requireAuth);

router.get("/", getUserNotifications);
router.get("/unread-count", getUnreadNotificationCount);
router.patch("/:id/read", markNotificationAsRead);
router.patch("/read-all", markAllNotificationsAsRead);
router.delete("/:id", deleteUserNotification);

export default router;
