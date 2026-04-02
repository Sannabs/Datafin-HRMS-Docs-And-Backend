import { EmployeeWarningStatus } from "@prisma/client";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

const FEED_LIMIT_DEFAULT = 60;
const FEED_LIMIT_MAX = 200;

function parseDateStart(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateEnd(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateLong(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function dayParts(d) {
  const x = new Date(d);
  return {
    dayShort: x.toLocaleDateString("en-US", { weekday: "short" }),
    dayNum: String(x.getDate()),
  };
}

function uiStatusToLower(s) {
  return String(s).toLowerCase();
}

/**
 * GET /api/employees/:userId/combined-feed
 * Merged timeline: attendance, leave, tenant holidays, excused absences, issued warnings.
 */
export const getEmployeeCombinedFeed = async (req, res) => {
  try {
    const requesterId = req.user?.id;
    const requesterRole = req.user?.role;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    let rawId = req.params?.userId;

    const canViewOtherEmployees =
      ["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"].includes(requesterRole) ||
      (requesterRole === "SUPER_ADMIN" && req.effectiveTenantId);

    if (!requesterId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "User not authenticated",
      });
    }

    if (rawId === "me") {
      rawId = requesterId;
    }

    if (!rawId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "User id is required",
      });
    }

    if (rawId !== requesterId && !canViewOtherEmployees) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You can only view your own feed",
      });
    }

    const employee = await prisma.user.findFirst({
      where: {
        id: rawId,
        isDeleted: false,
        ...(tenantId && { tenantId }),
      },
      select: { id: true, tenantId: true },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Employee not found",
      });
    }

    const now = new Date();
    const defaultEnd = parseDateEnd(now.toISOString().slice(0, 10));
    const defaultStart = parseDateStart(
      new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    );

    let rangeStart =
      req.query.startDate != null && req.query.startDate !== ""
        ? parseDateStart(String(req.query.startDate))
        : defaultStart;
    let rangeEnd =
      req.query.endDate != null && req.query.endDate !== ""
        ? parseDateEnd(String(req.query.endDate))
        : defaultEnd;

    if (!rangeStart || !rangeEnd) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Invalid startDate or endDate",
      });
    }

    if (rangeStart > rangeEnd) {
      const t = rangeStart;
      rangeStart = rangeEnd;
      rangeEnd = t;
    }

    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      Math.max(1, parseInt(String(req.query.limit || String(FEED_LIMIT_DEFAULT)), 10) || FEED_LIMIT_DEFAULT),
      FEED_LIMIT_MAX
    );

    const userId = employee.id;
    const tId = employee.tenantId;

    const rangeStartDateOnly = new Date(rangeStart);
    rangeStartDateOnly.setHours(0, 0, 0, 0);
    const rangeEndDateOnly = new Date(rangeEnd);
    rangeEndDateOnly.setHours(0, 0, 0, 0);

    const [attendanceRows, leaveRows, holidayRows, exceptionRows, warningRows] =
      await Promise.all([
      prisma.attendance.findMany({
        where: {
          tenantId: tId,
          userId,
          clockInTime: { gte: rangeStart, lte: rangeEnd },
        },
        orderBy: { clockInTime: "desc" },
        take: FEED_LIMIT_MAX,
        include: {
          location: { select: { name: true } },
        },
      }),
      prisma.leaveRequest.findMany({
        where: {
          tenantId: tId,
          userId,
          status: { notIn: ["CANCELLED"] },
          AND: [
            { startDate: { lte: rangeEndDateOnly } },
            { endDate: { gte: rangeStartDateOnly } },
          ],
        },
        orderBy: { startDate: "desc" },
        take: FEED_LIMIT_MAX,
        include: {
          leaveType: { select: { name: true } },
        },
      }),
      prisma.holiday.findMany({
        where: {
          tenantId: tId,
          isActive: true,
          date: { gte: rangeStartDateOnly, lte: rangeEndDateOnly },
        },
        orderBy: { date: "desc" },
        take: FEED_LIMIT_MAX,
      }),
      prisma.attendanceException.findMany({
        where: {
          tenantId: tId,
          userId,
          isActive: true,
          date: { gte: rangeStartDateOnly, lte: rangeEndDateOnly },
        },
        orderBy: { date: "desc" },
        take: FEED_LIMIT_MAX,
      }),
      prisma.employeeWarning.findMany({
        where: {
          tenantId: tId,
          userId,
          status: EmployeeWarningStatus.ISSUED,
          issuedAt: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        orderBy: { issuedAt: "desc" },
        take: FEED_LIMIT_MAX,
      }),
    ]);

    const items = [];

    for (const a of attendanceRows) {
      const sortAt = a.clockInTime ?? a.createdAt;
      const { dayShort, dayNum } = dayParts(sortAt);
      let title = "Present";
      let uiStatus = "PRESENT";
      /** Distinct UI color key (clock records). */
      let feedVariant = "attendance_on_time";
      if (a.status === "ABSENT") {
        title = "Absent";
        uiStatus = "ABSENT";
        feedVariant = "attendance_absent";
      } else if (a.status === "LATE") {
        title = "Late";
        uiStatus = "PRESENT";
        feedVariant = "attendance_late";
      } else if (a.status === "EARLY") {
        title = "Early";
        uiStatus = "PRESENT";
        feedVariant = "attendance_early";
      } else if (a.status === "ON_TIME") {
        title = "Present";
        uiStatus = "PRESENT";
        feedVariant = "attendance_on_time";
      }

      const inStr = formatTime(a.clockInTime);
      const outStr = formatTime(a.clockOutTime);
      const loc = a.location?.name;
      const parts = [];
      if (inStr) parts.push(`Clocked in at ${inStr}`);
      if (outStr) parts.push(`clocked out at ${outStr}`);
      let detail = parts.join(" and ");
      if (loc) detail = detail ? `${detail} · ${loc}` : loc;
      if (!detail.trim()) detail = notesOrDefault(a.notes);

      items.push({
        id: `attendance:${a.id}`,
        kind: "ATTENDANCE",
        feedVariant,
        uiStatus: uiStatusToLower(uiStatus),
        sortAt: sortAt.toISOString(),
        dayShort,
        dayNum,
        title,
        detail: detail || "Attendance record",
      });
    }

    for (const lr of leaveRows) {
      const sortAt = new Date(lr.startDate);
      sortAt.setHours(12, 0, 0, 0);
      const { dayShort, dayNum } = dayParts(sortAt);
      const ltName = lr.leaveType?.name ?? "Leave";
      let title = "";
      let uiStatus = "PENDING";
      let detail = "";
      let feedVariant = "leave_pending";

      if (lr.status === "PENDING") {
        title = "Waiting for approval";
        uiStatus = "PENDING";
        feedVariant = "leave_pending";
        detail = `${ltName} ${formatDateLong(lr.startDate)} – ${formatDateLong(lr.endDate)}`;
        if (lr.reason) detail += `. ${lr.reason}`;
      } else if (lr.status === "MANAGER_APPROVED") {
        title = "Awaiting HR approval";
        uiStatus = "PENDING";
        feedVariant = "leave_awaiting_hr";
        detail = `${ltName} ${formatDateLong(lr.startDate)} – ${formatDateLong(lr.endDate)}`;
      } else if (lr.status === "APPROVED") {
        title = ltName;
        uiStatus = "EXCUSED_ABSENCE";
        feedVariant = "leave_approved";
        detail = `Approved leave ${formatDateLong(lr.startDate)} – ${formatDateLong(lr.endDate)}`;
        if (lr.reason) detail += `. ${lr.reason}`;
      } else if (lr.status === "REJECTED") {
        title = "Leave rejected";
        uiStatus = "ABSENT";
        feedVariant = "leave_rejected";
        detail = `${ltName} ${formatDateLong(lr.startDate)} – ${formatDateLong(lr.endDate)}`;
        if (lr.rejectionReason) detail += `. ${lr.rejectionReason}`;
      } else {
        continue;
      }

      items.push({
        id: `leave:${lr.id}`,
        kind: "LEAVE",
        feedVariant,
        uiStatus: uiStatusToLower(uiStatus),
        sortAt: sortAt.toISOString(),
        dayShort,
        dayNum,
        title,
        detail,
      });
    }

    for (const h of holidayRows) {
      const sortAt = new Date(h.date);
      sortAt.setHours(12, 0, 0, 0);
      const { dayShort, dayNum } = dayParts(sortAt);
      items.push({
        id: `holiday:${h.id}`,
        kind: "HOLIDAY",
        feedVariant: "holiday",
        uiStatus: "holiday",
        sortAt: sortAt.toISOString(),
        dayShort,
        dayNum,
        title: h.name || "Holiday",
        detail:
          h.description?.trim() ||
          `${String(h.type ?? "HOLIDAY").replace(/_/g, " ")} holiday`,
      });
    }

    for (const ex of exceptionRows) {
      const sortAt = new Date(ex.date);
      sortAt.setHours(12, 0, 0, 0);
      const { dayShort, dayNum } = dayParts(sortAt);
      const cat = String(ex.reasonCategory || "").replace(/_/g, " ");
      items.push({
        id: `exception:${ex.id}`,
        kind: "ATTENDANCE_EXCEPTION",
        feedVariant: "exception",
        uiStatus: "excused_absence",
        sortAt: sortAt.toISOString(),
        dayShort,
        dayNum,
        title: "Excused absence",
        detail: [cat, ex.reason].filter(Boolean).join(" — ") || "Excused absence",
      });
    }

    for (const w of warningRows) {
      const sortAt = w.issuedAt ?? w.updatedAt;
      const { dayShort, dayNum } = dayParts(sortAt);
      const cat = String(w.category || "").replace(/_/g, " ");
      const detailParts = [
        `${cat} · ${String(w.severity || "").toLowerCase()}`,
        w.reason?.trim() ? w.reason.trim() : null,
      ].filter(Boolean);
      items.push({
        id: `warning:${w.id}`,
        kind: "WARNING",
        feedVariant: "warning_issued",
        uiStatus: "present",
        sortAt: sortAt.toISOString(),
        dayShort,
        dayNum,
        title: w.title || "Formal warning",
        detail: detailParts.join(". ") || "Formal warning issued",
      });
    }

    items.sort((a, b) => new Date(b.sortAt) - new Date(a.sortAt));

    const total = items.length;
    const skip = (page - 1) * limit;
    const paged = items.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      message: "Combined feed retrieved successfully",
      data: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      range: {
        startDate: rangeStart.toISOString().slice(0, 10),
        endDate: rangeEnd.toISOString().slice(0, 10),
      },
    });
  } catch (error) {
    logger.error(`getEmployeeCombinedFeed: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to load combined feed",
    });
  }
};

function notesOrDefault(notes) {
  if (notes && String(notes).trim()) return String(notes).trim();
  return "";
}
