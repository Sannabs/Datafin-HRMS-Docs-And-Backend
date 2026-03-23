import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { normalizeTimeFormat } from "../utils/attendance.util.js";

const tenantWhere = (req) => req.effectiveTenantId ?? req.user.tenantId;

function badTime(error) {
  const m = error?.message ?? "";
  return m.includes("Invalid time") || m.includes("Time must be");
}

async function clearDefaultForTenant(tenantId) {
  await prisma.shift.updateMany({
    where: { tenantId },
    data: { isDefault: false },
  });
}

export const listShifts = async (req, res) => {
  try {
    const tenantId = tenantWhere(req);
    const { isActive } = req.query;
    const where = { tenantId };
    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const shifts = await prisma.shift.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    return res.status(200).json({
      success: true,
      data: shifts,
      count: shifts.length,
    });
  } catch (error) {
    logger.error(`listShifts: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to list shifts",
    });
  }
};

export const createShift = async (req, res) => {
  try {
    const tenantId = tenantWhere(req);
    const { name, startTime, endTime, isDefault, isActive } = req.body;

    if (!name || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "name, startTime, and endTime are required",
      });
    }

    let start;
    let end;
    try {
      start = normalizeTimeFormat(startTime);
      end = normalizeTimeFormat(endTime);
    } catch (e) {
      if (badTime(e)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: e.message,
        });
      }
      throw e;
    }

    if (isDefault) {
      await clearDefaultForTenant(tenantId);
    }

    const shift = await prisma.shift.create({
      data: {
        tenantId,
        name: String(name).trim(),
        startTime: start,
        endTime: end,
        isDefault: Boolean(isDefault),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    logger.info(`Created shift ${shift.id}`);
    return res.status(201).json({
      success: true,
      data: shift,
      message: "Shift created successfully",
    });
  } catch (error) {
    logger.error(`createShift: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create shift",
    });
  }
};

export const updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = tenantWhere(req);
    const { name, startTime, endTime, isDefault, isActive } = req.body;

    const existing = await prisma.shift.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Shift not found",
      });
    }

    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    try {
      if (startTime !== undefined) data.startTime = normalizeTimeFormat(startTime);
      if (endTime !== undefined) data.endTime = normalizeTimeFormat(endTime);
    } catch (e) {
      if (badTime(e)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: e.message,
        });
      }
      throw e;
    }
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (isDefault === true) {
      await clearDefaultForTenant(tenantId);
      data.isDefault = true;
    } else if (isDefault === false) {
      data.isDefault = false;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "No fields to update",
      });
    }

    const shift = await prisma.shift.update({
      where: { id },
      data,
    });

    logger.info(`Updated shift ${id}`);
    return res.status(200).json({
      success: true,
      data: shift,
      message: "Shift updated successfully",
    });
  } catch (error) {
    logger.error(`updateShift: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update shift",
    });
  }
};

export const deleteShift = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = tenantWhere(req);

    const existing = await prisma.shift.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Shift not found",
      });
    }

    await prisma.$transaction([
      prisma.user.updateMany({
        where: { shiftId: id },
        data: { shiftId: null },
      }),
      prisma.shift.delete({ where: { id } }),
    ]);

    logger.info(`Deleted shift ${id}`);
    return res.status(200).json({
      success: true,
      message: "Shift deleted successfully",
    });
  } catch (error) {
    logger.error(`deleteShift: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to delete shift",
    });
  }
};
