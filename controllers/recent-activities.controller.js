import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

function formatTime(date) {
  return new Date(date).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export const getRecentActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    const rows = await prisma.recentActivity.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const data = rows.map((r) => ({
      id: r.id,
      type: r.type,
      icon: r.icon,
      time: formatTime(r.createdAt),
      description: r.description,
      color: r.color,
    }));

    res.json({ success: true, data });
  } catch (error) {
    logger.error(`getRecentActivities: ${error.message}`);
    res.status(500).json({ success: false, message: "Failed to load activities" });
  }
};
