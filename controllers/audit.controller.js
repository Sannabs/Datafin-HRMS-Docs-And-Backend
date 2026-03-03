import logger from "../utils/logger.js";
import prisma from "../config/prisma.config.js";

export const getAuditLogs = async (req, res, next) => {
  try {
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const page = parseInt(req.query.page || 1);
    const limit = Math.min(parseInt(req.query.limit || 10), 100); // Max limit 100
    const search = req.query.search?.trim() || "";
    const skip = (page - 1) * limit;

    const sortBy = req.query.sortBy || "timestamp";
    const sortOrder = req.query.sortOrder?.toLowerCase() || "desc";

    const validateSortOrders = ["asc", "desc"];
    const order = validateSortOrders.includes(sortOrder) ? sortOrder : "desc";

    const allowedSortFields = ["timestamp", "action", "entityType"];
    const field = allowedSortFields.includes(sortBy) ? sortBy : "timestamp";

    const where = { tenantId };

    if (search) {
      where.OR = [
        { entityType: { contains: search, mode: "insensitive" } },
        {
          user: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    if (!tenantId) {
      logger.error("Tenant ID is required");
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    const orderBy = {
      [field]: order,
    };

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return res.status(200).json({
      success: true,
      data: auditLogs,
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
    logger.error(`Error in getAuditLogs controller: ${error.message}`);
    next(error);
  }
};
