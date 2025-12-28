import prisma from "../config/prisma.config.js";
import { Prisma } from "@prisma/client";
import logger from "../utils/logger.js";

function parseBool(v, defaultValue = false) {
  if (v === undefined) return defaultValue;
  if (typeof v === "boolean") return v;
  return String(v).toLowerCase() === "true";
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function baseUserWhere(tenantId, includeDeleted) {
  const where = { tenantId };
  if (!includeDeleted) {
    where.isDeleted = false;
    where.deletedAt = null;
  }
  return where;
}

/**
 * GET /api/analytics/users/overview?start=&end=&includeDeleted=false
 */
export const getUsersOverview = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Missing tenantId in auth context",
      });
    }

    const includeDeleted = parseBool(req.query.includeDeleted, false);
    const start = req.query.start ? parseDate(req.query.start) : null;
    const end = req.query.end ? parseDate(req.query.end) : null;

    if ((req.query.start && !start) || (req.query.end && !end)) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        message: "Invalid start/end datetime. Use ISO 8601.",
      });
    }

    const where = baseUserWhere(tenantId, includeDeleted);

    const total = await prisma.user.count({ where });

    const newUsers = await prisma.user.count({
      where: {
        ...where,
        ...(start || end
          ? {
              createdAt: {
                ...(start ? { gte: start } : {}),
                ...(end ? { lte: end } : {}),
              },
            }
          : {}),
      },
    });

    const byRole = await prisma.user.groupBy({
      by: ["role"],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
    });

    const byStatus = await prisma.user.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
    });

    const byDepartment = await prisma.user.groupBy({
      by: ["departmentId"],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
    });

    const byPosition = await prisma.user.groupBy({
      by: ["positionId"],
      where,
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
    });

    // Resolve department/position labels for frontend charts (optional but useful)
    const departmentIds = byDepartment.map((x) => x.departmentId).filter(Boolean);
    const positionIds = byPosition.map((x) => x.positionId).filter(Boolean);

    const [departments, positions] = await Promise.all([
      prisma.department.findMany({
        where: { id: { in: departmentIds }, tenantId, deletedAt: null },
        select: { id: true, name: true, code: true },
      }),
      prisma.position.findMany({
        where: { id: { in: positionIds }, tenantId, deletedAt: null },
        select: { id: true, title: true, code: true },
      }),
    ]);

    const deptMap = new Map(departments.map((d) => [d.id, d]));
    const posMap = new Map(positions.map((p) => [p.id, p]));

    return res.json({
      success: true,
      data: {
        total,
        newUsers,
        byRole: byRole.map((r) => ({ role: r.role, count: r._count._all })),
        byStatus: byStatus.map((s) => ({
          status: s.status ?? "UNKNOWN",
          count: s._count._all,
        })),
        byDepartment: byDepartment.map((d) => ({
          departmentId: d.departmentId ?? null,
          departmentName: d.departmentId
            ? deptMap.get(d.departmentId)?.name ?? null
            : null,
          count: d._count._all,
        })),
        byPosition: byPosition.map((p) => ({
          positionId: p.positionId ?? null,
          positionTitle: p.positionId ? posMap.get(p.positionId)?.title ?? null : null,
          count: p._count._all,
        })),
      },
    });
  } catch (err) {
    logger.error(`Error in getUsersOverview: ${err.message}`, {
      stack: err.stack,
      tenantId: req.user?.tenantId,
    });
    next(err);
  }
};

/**
 * GET /api/analytics/users/registrations?start=&end=&interval=day|week|month&includeDeleted=false
 */
export const getUserRegistrationsSeries = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Missing tenantId in auth context",
      });
    }

    const interval = String(req.query.interval || "day");
    if (!["day", "week", "month"].includes(interval)) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        message: "interval must be one of: day, week, month",
      });
    }

    const start = req.query.start ? parseDate(req.query.start) : null;
    const end = req.query.end ? parseDate(req.query.end) : null;

    if ((req.query.start && !start) || (req.query.end && !end)) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        message: "Invalid start/end datetime. Use ISO 8601.",
      });
    }

    const includeDeleted = parseBool(req.query.includeDeleted, false);

    const parts = [Prisma.sql`u."tenantId" = ${tenantId}`];

    if (!includeDeleted) {
      parts.push(Prisma.sql`u."isDeleted" = false`);
      parts.push(Prisma.sql`u."deletedAt" IS NULL`);
    }
    if (start) parts.push(Prisma.sql`u."createdAt" >= ${start}`);
    if (end) parts.push(Prisma.sql`u."createdAt" <= ${end}`);

    const whereSql = Prisma.sql`${Prisma.join(parts, Prisma.sql` AND `)}`;

    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT date_trunc(${interval}, u."createdAt") AS bucket,
             COUNT(*)::bigint AS count
      FROM "User" u
      WHERE ${whereSql}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return res.json({
      success: true,
      data: rows.map((r) => ({ bucket: r.bucket.toISOString(), count: Number(r.count) })),
    });
  } catch (err) {
    logger.error(`Error in getUserRegistrationsSeries: ${err.message}`, {
      stack: err.stack,
      tenantId: req.user?.tenantId,
    });
    next(err);
  }
};

/**
 * GET /api/analytics/users/logins?start=&end=&interval=day|week|month&includeDeleted=false
 * Login events are approximated by Session.createdAt (Better Auth session table)
 */
export const getUserLoginsSeries = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Missing tenantId in auth context",
      });
    }

    const includeDeleted = parseBool(req.query.includeDeleted, false);

    const interval = String(req.query.interval || "day");
    if (!["day", "week", "month"].includes(interval)) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        message: "interval must be one of: day, week, month",
      });
    }

    const start = req.query.start ? parseDate(req.query.start) : null;
    const end = req.query.end ? parseDate(req.query.end) : null;

    if ((req.query.start && !start) || (req.query.end && !end)) {
      return res.status(400).json({
        success: false,
        error: "Validation Error",
        message: "Invalid start/end datetime. Use ISO 8601.",
      });
    }

    const parts = [Prisma.sql`u."tenantId" = ${tenantId}`];

    if (!includeDeleted) {
      parts.push(Prisma.sql`u."isDeleted" = false`);
      parts.push(Prisma.sql`u."deletedAt" IS NULL`);
    }

    if (start) parts.push(Prisma.sql`s."createdAt" >= ${start}`);
    if (end) parts.push(Prisma.sql`s."createdAt" <= ${end}`);

    const whereSql = Prisma.sql`${Prisma.join(parts, Prisma.sql` AND `)}`;

    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT date_trunc(${interval}, s."createdAt") AS bucket,
             COUNT(*)::bigint AS count
      FROM "session" s
      JOIN "User" u ON u."id" = s."userId"
      WHERE ${whereSql}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    return res.json({
      success: true,
      data: rows.map((r) => ({ bucket: r.bucket.toISOString(), count: Number(r.count) })),
    });
  } catch (err) {
    logger.error(`Error in getUserLoginsSeries: ${err.message}`, {
      stack: err.stack,
      tenantId: req.user?.tenantId,
    });
    next(err);
  }
};

/**
 * GET /api/analytics/users/recency?includeDeleted=false
 * Buckets based on User.lastLogin
 */
export const getUserLoginRecency = async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Missing tenantId in auth context",
      });
    }

    const includeDeleted = parseBool(req.query.includeDeleted, false);
    const where = baseUserWhere(tenantId, includeDeleted);

    const now = new Date();
    const d7 = new Date(now);
    d7.setDate(now.getDate() - 7);
    const d30 = new Date(now);
    d30.setDate(now.getDate() - 30);
    const d90 = new Date(now);
    d90.setDate(now.getDate() - 90);

    const [d0_7, d8_30, d31_90, d90plus, never] = await Promise.all([
      prisma.user.count({ where: { ...where, lastLogin: { gte: d7 } } }),
      prisma.user.count({ where: { ...where, lastLogin: { lt: d7, gte: d30 } } }),
      prisma.user.count({ where: { ...where, lastLogin: { lt: d30, gte: d90 } } }),
      prisma.user.count({ where: { ...where, lastLogin: { lt: d90 } } }),
      prisma.user.count({ where: { ...where, lastLogin: null } }),
    ]);

    return res.json({
      success: true,
      data: {
        "0_7_days": d0_7,
        "8_30_days": d8_30,
        "31_90_days": d31_90,
        "90plus_days": d90plus,
        "never_logged_in": never,
      },
    });
  } catch (err) {
    logger.error(`Error in getUserLoginRecency: ${err.message}`, {
      stack: err.stack,
      tenantId: req.user?.tenantId,
    });
    next(err);
  }
};
