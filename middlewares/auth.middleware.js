import logger from "../utils/logger.js";
import { auth } from "../utils/auth.js";
import prisma from "../config/prisma.config.js";

export const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session || !session.user) {
      return res
        .status(401)
        .json({ error: "Unauthorized", message: "Please sign in to continue" });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        role: true,
        tenantId: true,
      },
    });

    if (!user) {
      logger.warn(`User not found for session: ${session.user.id}`);
      return res.status(401).json({
        error: "Unauthorized",
        message: "User account not found",
      });
    }

    req.user = user;
    req.session = session;

    next();
  } catch (error) {
    logger.error(`Error in requireAuth middleware: ${error.message}`);
    if (
      error.message?.includes("session") ||
      error.message?.includes("token")
    ) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication check failed",
      });
    }

    return res.status(500).json({
      error: "Internal Server Error",
      message: "Authentication check failed",
    });
  }
};