/**
 * Seed script: Recent Activities and Notifications
 * Usage: node scripts/seed-recent-activities-and-notifications.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Uses:
 *   userId:  6DNllQIKhVqnM2bheDSWv7BufEn3Wfaj
 *   tenantId: 7cb83755-abef-40b7-9b98-6385647a960f
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";

const USER_ID = "6DNllQIKhVqnM2bheDSWv7BufEn3Wfaj";
const TENANT_ID = "7cb83755-abef-40b7-9b98-6385647a960f";

const RECENT_ACTIVITIES = [
  { type: "clock_in", description: "Clocked in at 8:02 AM", icon: "log-in", color: "#22C55E" },
  { type: "clock_out", description: "Clocked out at 5:30 PM", icon: "log-out", color: "#EF4444" },
  { type: "approved_leave", description: "Annual leave for Feb 15–20 approved", icon: "check-circle", color: "#22C55E" },
  { type: "leave_submitted", description: "Leave request submitted for review", icon: "send", color: "#3B82F6" },
  { type: "payroll", description: "January payroll processed", icon: "dollar-sign", color: "#8B5CF6" },
  { type: "attendance", description: "Attendance record updated", icon: "clipboard", color: "#F59E0B" },
  { type: "clock_in", description: "Clocked in at 7:58 AM", icon: "log-in", color: "#22C55E" },
  { type: "clock_out", description: "Clocked out at 5:45 PM", icon: "log-out", color: "#EF4444" },
  { type: "other", description: "Profile updated", icon: "user", color: "#6B7280" },
  { type: "clock_in", description: "Clocked in at 8:15 AM", icon: "log-in", color: "#22C55E" },
];

const NOTIFICATIONS = [
  {
    title: "Payroll processed",
    message: "Your payroll for January 2025 has been processed. Payslips are available in the Pay section.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Leave request approved",
    message: "Your annual leave request for Feb 15–20 has been approved by your manager.",
    type: "LEAVE",
    readStatus: false,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Clock-in reminder",
    message: "You have not clocked in today. Tap to record your attendance.",
    type: "ATTENDANCE",
    readStatus: true,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Performance review scheduled",
    message: "Your Q1 performance review is scheduled for March 10. Prepare your self-assessment.",
    type: "PERFORMANCE",
    readStatus: true,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "New activity on your leave",
    message: "Someone commented on your leave request. Check the Time Off screen for details.",
    type: "ACTIVITIES",
    readStatus: false,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Payslip available",
    message: "Your payslip for the latest pay period is ready to view.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Attendance summary",
    message: "Your weekly attendance summary is now available.",
    type: "ATTENDANCE",
    readStatus: true,
    actionUrl: null,
  },
];

async function seed() {
  console.log("Seeding recent activities and notifications...");
  console.log("tenantId:", TENANT_ID);
  console.log("userId:", USER_ID);

  // Ensure user and tenant exist
  const user = await prisma.user.findUnique({ where: { id: USER_ID } });
  const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
  if (!user) {
    throw new Error(`User not found: ${USER_ID}. Create the user first.`);
  }
  if (!tenant) {
    throw new Error(`Tenant not found: ${TENANT_ID}. Create the tenant first.`);
  }

  // Seed recent activities (createdAt will be now() for each, order preserved by creation order)
  const activityData = RECENT_ACTIVITIES.map((a) => ({
    tenantId: TENANT_ID,
    userId: USER_ID,
    type: a.type,
    description: a.description,
    icon: a.icon,
    color: a.color,
  }));

  const createdActivities = await prisma.recentActivity.createMany({
    data: activityData,
    skipDuplicates: true,
  });
  console.log("Recent activities created:", createdActivities.count);

  // Seed notifications
  const notificationData = NOTIFICATIONS.map((n) => ({
    tenantId: TENANT_ID,
    userId: USER_ID,
    title: n.title,
    message: n.message,
    type: n.type,
    readStatus: n.readStatus,
    actionUrl: n.actionUrl,
  }));

  const createdNotifications = await prisma.notification.createMany({
    data: notificationData,
    skipDuplicates: false,
  });
  console.log("Notifications created:", createdNotifications.count);

  console.log("Seed completed successfully.");
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
