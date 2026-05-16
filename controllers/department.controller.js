import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import { isEmployeeActiveForWork } from "../utils/employee-status.util.js";
import { sendDepartmentManagerAssignedEmail } from "../views/sendDepartmentManagerAssignedEmail.js";

// List all departments (tenant-scoped)
// Optional: ?includeManager=true to include manager details for each department.
export const getAllDepartments = async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const includeManager = String(req.query.includeManager).toLowerCase() === "true";

    const departments = await prisma.department.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        ...(includeManager && {
          managerId: true,
          manager: {
            select: { id: true, name: true, email: true, employeeId: true },
          },
        }),
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
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
        message: "A department with this name already exists",
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

// Update department manager (HR_ADMIN only)
// Body: { managerId: string | null }
// Allows assigning the same user to multiple departments (one manager, many depts).
// Pass null to unassign.
export const updateDepartment = async (req, res) => {
  try {
    const { id: actorId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const { id: departmentId } = req.params;
    const { managerId } = req.body;

    if (!Object.prototype.hasOwnProperty.call(req.body, "managerId")) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "managerId is required (use null to unassign)",
      });
    }

    const department = await prisma.department.findFirst({
      where: { id: departmentId, tenantId, deletedAt: null },
      include: {
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    if (!department) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Department not found",
      });
    }

    if (department.managerId === (managerId ?? null)) {
      return res.status(200).json({
        success: true,
        data: department,
        message: "No changes — manager is already set to this value",
      });
    }

    let newManager = null;
    if (managerId) {
      newManager = await prisma.user.findFirst({
        where: { id: managerId, tenantId, isDeleted: false },
        select: { id: true, name: true, email: true, role: true, status: true },
      });

      if (!newManager) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "User not found in this tenant",
        });
      }

      if (newManager.role !== "DEPARTMENT_ADMIN") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "User must have the Department Admin role before being assigned as a manager",
        });
      }

      if (!isEmployeeActiveForWork(newManager.status)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "User is not active and cannot be assigned as a manager",
        });
      }
    }

    const updated = await prisma.department.update({
      where: { id: departmentId },
      data: { managerId: managerId ?? null },
      include: {
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    logger.info(
      `Department ${departmentId} manager updated: ${department.managerId ?? "none"} -> ${updated.managerId ?? "none"}`
    );

    await addLog(
      actorId,
      tenantId,
      "UPDATE",
      "Department",
      departmentId,
      {
        managerId: {
          before: department.managerId ?? null,
          after: updated.managerId ?? null,
        },
      },
      req
    );

    if (newManager?.email) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });

        await sendDepartmentManagerAssignedEmail({
          to: newManager.email,
          employeeName: newManager.name || "there",
          departmentName: updated.name,
          tenantName: tenant?.name || "your organization",
        });
      } catch (emailError) {
        logger.error(
          `Failed to send department manager assigned email to ${newManager.email}: ${emailError.message}`,
          { stack: emailError.stack }
        );
      }
    }

    return res.status(200).json({
      success: true,
      data: updated,
      message: "Department manager updated successfully",
    });
  } catch (error) {
    logger.error(`Error updating department: ${error.message}`, {
      error: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update department",
    });
  }
};
