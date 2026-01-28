import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";

// List all departments (tenant-scoped)
export const getAllDepartments = async (req, res) => {
  try {
    const { tenantId } = req.user;

    const departments = await prisma.department.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    logger.info(`Retrieved ${departments.length} departments`);

    return res.status(200).json({
      success: true,
      data: departments,
      count: departments.length,
    });
  } catch (error) {
    logger.error(`Error fetching departments: ${error.message}`, {
      error: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch departments",
    });
  }
};

// Create a department (tenant-scoped)
export const createDepartment = async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Department name is required",
      });
    }


    const department = await prisma.department.create({
      data: {
        tenantId,
        name: name.trim(),
      },
    });

    logger.info(`Created department with ID: ${department.id}`);
    const changes = {
      name: { before: null, after: department.name },
    };
    await addLog(userId, tenantId, "CREATE", "Department", department.id, changes, req);

    return res.status(201).json({
      success: true,
      data: department,
      message: "Department created successfully",
    });
  } catch (error) {
    // Prisma unique constraint error
    if (error.code === "P2002") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "A department with this name or code already exists",
      });
    }

    logger.error(`Error creating department: ${error.message}`, {
      error: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create department",
    });
  }
};

