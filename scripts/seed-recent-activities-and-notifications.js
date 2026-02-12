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

const NOTIFICATION_TEMPLATES = [
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
  {
    title: "Leave balance updated",
    message: "Your leave balance has been updated after the recent approval.",
    type: "LEAVE",
    readStatus: true,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Overtime recorded",
    message: "Overtime hours for last week have been added to your attendance.",
    type: "ATTENDANCE",
    readStatus: false,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Pay period closed",
    message: "The current pay period has been closed. Payroll will run soon.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Goals submitted",
    message: "Your team member has submitted their performance goals for review.",
    type: "PERFORMANCE",
    readStatus: false,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Sick leave request",
    message: "A new sick leave request is pending your approval.",
    type: "LEAVE",
    readStatus: false,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Late clock-in noted",
    message: "You clocked in after the grace period. Check your attendance for details.",
    type: "ATTENDANCE",
    readStatus: true,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Bonus processed",
    message: "Your performance bonus has been included in the next payroll.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "1:1 meeting reminder",
    message: "Your weekly 1:1 with your manager is scheduled for tomorrow.",
    type: "PERFORMANCE",
    readStatus: true,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Leave request rejected",
    message: "Your leave request for March 5–7 could not be approved due to coverage.",
    type: "LEAVE",
    readStatus: false,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Timesheet reminder",
    message: "Please submit your timesheet for the current week.",
    type: "ATTENDANCE",
    readStatus: false,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Tax document ready",
    message: "Your year-end tax document is available in the Pay section.",
    type: "PAYROLL",
    readStatus: true,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Feedback received",
    message: "You have received new feedback from your manager.",
    type: "PERFORMANCE",
    readStatus: false,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Leave policy updated",
    message: "Company leave policy has been updated. Review in Time Off.",
    type: "LEAVE",
    readStatus: true,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Shift swap approved",
    message: "Your requested shift swap has been approved.",
    type: "ATTENDANCE",
    readStatus: false,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Deduction updated",
    message: "A deduction on your payslip has been updated. View in Pay.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Self-assessment due",
    message: "Your self-assessment for Q1 is due in 3 days.",
    type: "PERFORMANCE",
    readStatus: false,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Public holiday added",
    message: "A public holiday has been added to the calendar. Check Time Off.",
    type: "LEAVE",
    readStatus: true,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Absence recorded",
    message: "An absence was recorded for a day you did not clock in.",
    type: "ATTENDANCE",
    readStatus: false,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Reimbursement processed",
    message: "Your expense reimbursement has been added to the next pay.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Review cycle started",
    message: "The annual performance review cycle has started.",
    type: "PERFORMANCE",
    readStatus: false,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Carry-over leave applied",
    message: "Your unused leave from last year has been carried over.",
    type: "LEAVE",
    readStatus: true,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Work-from-home day",
    message: "You have marked today as a work-from-home day.",
    type: "ATTENDANCE",
    readStatus: true,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Payslip viewed",
    message: "You viewed your latest payslip.",
    type: "PAYROLL",
    readStatus: true,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Objective completed",
    message: "You marked an objective as completed. Great work!",
    type: "PERFORMANCE",
    readStatus: true,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Leave cancelled",
    message: "Your leave request for next week has been cancelled.",
    type: "LEAVE",
    readStatus: false,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Break time logged",
    message: "Your break has been logged in your attendance record.",
    type: "ATTENDANCE",
    readStatus: true,
    actionUrl: null,
  },
  {
    title: "Salary revision",
    message: "Your salary revision is effective from next month. Details in Pay.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Peer feedback request",
    message: "You have been asked to provide peer feedback for a colleague.",
    type: "PERFORMANCE",
    readStatus: false,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Half-day leave approved",
    message: "Your half-day leave request has been approved.",
    type: "LEAVE",
    readStatus: false,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Geofence check-in",
    message: "You clocked in within the allowed work location.",
    type: "ATTENDANCE",
    readStatus: true,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Allowance added",
    message: "A new allowance has been added to your salary structure.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Training completed",
    message: "Your completed training has been recorded in Performance.",
    type: "PERFORMANCE",
    readStatus: true,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "Leave balance reminder",
    message: "You have 5 days of annual leave remaining this year.",
    type: "LEAVE",
    readStatus: true,
    actionUrl: "/(tabs)/time-off",
  },
  {
    title: "Week summary",
    message: "Your attendance summary for this week is ready.",
    type: "ATTENDANCE",
    readStatus: false,
    actionUrl: "/(tabs)/attendance",
  },
  {
    title: "Pay run completed",
    message: "The monthly pay run has been completed successfully.",
    type: "PAYROLL",
    readStatus: false,
    actionUrl: "/(tabs)/pay",
  },
  {
    title: "Skill assessment",
    message: "Complete your skill assessment in the Performance section.",
    type: "PERFORMANCE",
    readStatus: false,
    actionUrl: "/(tabs)/performance",
  },
  {
    title: "System notice",
    message: "HRMS will be under maintenance tonight 11 PM–1 AM.",
    type: "OTHER",
    readStatus: false,
    actionUrl: null,
  },
];

// Build a large list for infinite-scroll testing (50 notifications, so 2.5+ pages at limit 20)
const NOTIFICATIONS = [];
for (let i = 0; i < 50; i++) {
  const t = NOTIFICATION_TEMPLATES[i % NOTIFICATION_TEMPLATES.length];
  NOTIFICATIONS.push({ ...t });
}

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

  // Clear existing notifications and recent activities for this user/tenant
  const deletedNotifications = await prisma.notification.deleteMany({
    where: { tenantId: TENANT_ID, userId: USER_ID },
  });
  const deletedActivities = await prisma.recentActivity.deleteMany({
    where: { tenantId: TENANT_ID, userId: USER_ID },
  });
  console.log("Cleared existing data: notifications", deletedNotifications.count, "| recent activities", deletedActivities.count);

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
