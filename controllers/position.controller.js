import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";

// List all positions (tenant-scoped)
export const getAllPositions = async (req, res) => {
  try {
    const { tenantId } = req.user;

    const where = {
      tenantId,
      deletedAt: null,
    };

    const positions = await prisma.position.findMany({
      where,
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    logger.info(`Retrieved ${positions.length} positions`);

    return res.status(200).json({
      success: true,
      data: positions,
      count: positions.length,
    });
  } catch (error) {
    logger.error(`Error fetching positions: ${error.message}`, {
      error: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch positions",
    });
  }
};

// Create a position (tenant-scoped)
export const createPosition = async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Position title is required",
      });
    }

    const position = await prisma.position.create({
      data: {
        tenantId,
        title: title.trim(),
      },
    });

    logger.info(`Created position with ID: ${position.id}`);
    const changes = {
      title: { before: null, after: position.title },
    };
    await addLog(userId, tenantId, "CREATE", "Position", position.id, changes, req);

    return res.status(201).json({
      success: true,
      data: position,
      message: "Position created successfully",
    });
  } catch (error) {
    // Prisma unique constraint error
    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "A position with this title or code already exists",
      });
    }

    logger.error(`Error creating position: ${error.message}`, {
      error: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create position",
    });
  }
};

