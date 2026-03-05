import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import { generateFilename, uploadFile } from "../config/storage.config.js";
import { calculateWorkingDays } from "../utils/working-days.utils.js";
import { createNotification } from "../services/notification.service.js";
import { sendLeaveRequestToManagerEmail } from "../views/sendLeaveRequestToManagerEmail.js";
import { sendLeaveRequestConfirmationEmail } from "../views/sendLeaveRequestConfirmationEmail.js";
import { recordRecentActivity } from "../utils/activity.util.js";
import { getDepartmentFilter } from "../utils/access-control.utils.js";

// ============================================
// LEAVE POLICY CONTROLLERS
// ============================================

export const getLeavePolicy = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }

    const policy = await prisma.annualLeavePolicy.findFirst({
      where: {
        tenantId,
      },
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave policy not found for this tenant",
      });
    }

    // Audit log for reading policy
    await addLog(
      userId,
      tenantId,
      "READ",
      "AnnualLeavePolicy",
      policy.id,
      null,
      req
    );

    res.status(200).json({
      success: true,
      message: "Leave policy fetched successfully",
      data: policy,
    });
  } catch (error) {
    logger.error(`Error getting leave policy: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get leave policy",
    });
  }
};

export const updateLeavePolicy = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const {
      defaultDaysPerYear,
      accrualMethod,
      accrualFrequency,
      accrualDaysPerPeriod,
      carryoverType,
      advanceNoticeDays,
      maxCarryoverDays,
      carryoverExpiryMonths,
      encashmentRate,
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }

    // Fetch existing policy first for audit logging and validation
    const existingPolicy = await prisma.annualLeavePolicy.findFirst({
      where: {
        tenantId,
      },
    });

    if (!existingPolicy) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave policy not found for this tenant",
      });
    }

    const updateData = {};

    // Validate and set defaultDaysPerYear
    if (defaultDaysPerYear !== undefined) {
      if (typeof defaultDaysPerYear !== "number" || defaultDaysPerYear < 0) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "defaultDaysPerYear must be a non-negative number",
        });
      }
      updateData.defaultDaysPerYear = defaultDaysPerYear;
    }

    // Validate and set accrualMethod
    if (accrualMethod !== undefined) {
      const validAccrualMethods = ["FRONT_LOADED", "ACCRUAL"];
      if (!validAccrualMethods.includes(accrualMethod)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `accrualMethod must be one of: ${validAccrualMethods.join(
            ", "
          )}`,
        });
      }
      updateData.accrualMethod = accrualMethod;

      // If changing to ACCRUAL, validate required fields exist (either in request or existing policy)
      if (accrualMethod === "ACCRUAL") {
        if (
          accrualFrequency === undefined &&
          accrualDaysPerPeriod === undefined &&
          !existingPolicy.accrualFrequency &&
          !existingPolicy.accrualDaysPerPeriod
        ) {
          return res.status(400).json({
            success: false,
            error: "Bad Request",
            message:
              "accrualFrequency and accrualDaysPerPeriod are required when accrualMethod is ACCRUAL",
          });
        }
      }

      // If changing to FRONT_LOADED, reject any ACCRUAL-specific fields and clear them
      if (accrualMethod === "FRONT_LOADED") {
        if (
          accrualFrequency !== undefined ||
          accrualDaysPerPeriod !== undefined
        ) {
          return res.status(400).json({
            success: false,
            error: "Bad Request",
            message:
              "accrualFrequency and accrualDaysPerPeriod cannot be set when accrualMethod is FRONT_LOADED",
          });
        }
        updateData.accrualFrequency = null;
        updateData.accrualDaysPerPeriod = null;
      }
    }

    // Validate and set accrualFrequency (only if accrualMethod is ACCRUAL)
    if (accrualFrequency !== undefined) {
      const validFrequencies = ["MONTHLY", "QUARTERLY", "ANNUALLY"];
      if (!validFrequencies.includes(accrualFrequency)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `accrualFrequency must be one of: ${validFrequencies.join(
            ", "
          )}`,
        });
      }

      const currentMethod = accrualMethod || existingPolicy.accrualMethod;
      if (currentMethod !== "ACCRUAL") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "accrualFrequency can only be set when accrualMethod is ACCRUAL",
        });
      }
      updateData.accrualFrequency = accrualFrequency;
    }

    // Validate and set accrualDaysPerPeriod (only if accrualMethod is ACCRUAL)
    if (accrualDaysPerPeriod !== undefined) {
      if (
        typeof accrualDaysPerPeriod !== "number" ||
        accrualDaysPerPeriod < 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "accrualDaysPerPeriod must be a non-negative number",
        });
      }

      const currentMethod = accrualMethod || existingPolicy.accrualMethod;
      if (currentMethod !== "ACCRUAL") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "accrualDaysPerPeriod can only be set when accrualMethod is ACCRUAL",
        });
      }
      updateData.accrualDaysPerPeriod = accrualDaysPerPeriod;
    }

    // Validate and set carryoverType
    if (carryoverType !== undefined) {
      const validCarryoverTypes = ["NONE", "FULL", "LIMITED", "ENCASHMENT"];
      if (!validCarryoverTypes.includes(carryoverType)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `carryoverType must be one of: ${validCarryoverTypes.join(
            ", "
          )}`,
        });
      }
      updateData.carryoverType = carryoverType;

      // Clear fields based on carryoverType
      if (carryoverType === "NONE" || carryoverType === "FULL") {
        updateData.maxCarryoverDays = null;
        updateData.encashmentRate = null;
      } else if (carryoverType === "LIMITED") {
        updateData.encashmentRate = null;
      } else if (carryoverType === "ENCASHMENT") {
        updateData.maxCarryoverDays = null;
      }
    }

    // Validate and set advanceNoticeDays
    if (advanceNoticeDays !== undefined) {
      if (
        typeof advanceNoticeDays !== "number" ||
        advanceNoticeDays < 0 ||
        !Number.isInteger(advanceNoticeDays)
      ) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "advanceNoticeDays must be a non-negative integer",
        });
      }
      updateData.advanceNoticeDays = advanceNoticeDays;
    }

    // Validate and set maxCarryoverDays (only if carryoverType is LIMITED)
    if (maxCarryoverDays !== undefined) {
      if (typeof maxCarryoverDays !== "number" || maxCarryoverDays < 0) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "maxCarryoverDays must be a non-negative number",
        });
      }

      const currentType = carryoverType || existingPolicy.carryoverType;
      if (currentType !== "LIMITED") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "maxCarryoverDays can only be set when carryoverType is LIMITED",
        });
      }
      updateData.maxCarryoverDays = maxCarryoverDays;
    }

    // Validate and set carryoverExpiryMonths (fixed field name)
    if (carryoverExpiryMonths !== undefined) {
      if (
        carryoverExpiryMonths !== null &&
        (typeof carryoverExpiryMonths !== "number" ||
          carryoverExpiryMonths < 0 ||
          !Number.isInteger(carryoverExpiryMonths))
      ) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "carryoverExpiryMonths must be null or a non-negative integer",
        });
      }
      updateData.carryoverExpiryMonths = carryoverExpiryMonths;
    }

    // Validate and set encashmentRate (only if carryoverType is ENCASHMENT)
    if (encashmentRate !== undefined) {
      if (typeof encashmentRate !== "number" || encashmentRate < 0) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "encashmentRate must be a non-negative number",
        });
      }

      const currentType = carryoverType || existingPolicy.carryoverType;
      if (currentType !== "ENCASHMENT") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message:
            "encashmentRate can only be set when carryoverType is ENCASHMENT",
        });
      }
      updateData.encashmentRate = encashmentRate;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "No valid fields to update",
      });
    }

    // Perform update
    const updatedPolicy = await prisma.annualLeavePolicy.update({
      where: {
        tenantId,
      },
      data: updateData,
    });

    // Audit logging
    const changes = getChangesDiff(existingPolicy, updatedPolicy);
    await addLog(
      userId,
      tenantId,
      "UPDATE",
      "AnnualLeavePolicy",
      updatedPolicy.id,
      changes,
      req
    );

    logger.info(
      `Leave policy updated for tenant ${tenantId} by user ${userId}`
    );

    res.status(200).json({
      success: true,
      message: "Leave policy updated successfully",
      data: updatedPolicy,
    });
  } catch (error) {
    logger.error(`Error updating leave policy: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
    });

    next(error); // Let global error handler deal with it
  }
};

// ============================================
// LEAVE TYPE CONTROLLERS
// ============================================

export const getAllLeaveTypes = async (req, res, next) => {
  try {
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const { isActive } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }

    const where = {
      tenantId,
      deletedAt: null,
    };

    // Filter by isActive if provided
    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const leaveTypes = await prisma.leaveType.findMany({
      where,
      include: {
        _count: {
          select: {
            leaveRequests: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    logger.info(
      `Retrieved ${leaveTypes.length} leave types for tenant ${tenantId}`
    );

    res.status(200).json({
      success: true,
      message: "Leave types fetched successfully",
      data: leaveTypes,
      count: leaveTypes.length,
    });
  } catch (error) {
    logger.error(`Error fetching leave types: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
    });

    next(error);
  }
};

export const createLeaveType = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const {
      name,
      description,
      color,
      isPaid,
      deductsFromAnnual,
      requiresDocument,
      isActive,
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Name is required",
      });
    }

    // Validate color format if provided (hex color)
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Color must be a valid hex color code (e.g., #FF5733)",
      });
    }

    const leaveType = await prisma.leaveType.create({
      data: {
        tenantId,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        isPaid: isPaid !== undefined ? isPaid : true,
        deductsFromAnnual:
          deductsFromAnnual !== undefined ? deductsFromAnnual : true,
        requiresDocument:
          requiresDocument !== undefined ? requiresDocument : false,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    logger.info(
      `Created leave type with ID: ${leaveType.id} for tenant ${tenantId}`
    );

    const changes = {
      name: { before: null, after: leaveType.name },
      description: { before: null, after: leaveType.description },
      color: { before: null, after: leaveType.color },
      isPaid: { before: null, after: leaveType.isPaid },
      deductsFromAnnual: { before: null, after: leaveType.deductsFromAnnual },
      requiresDocument: { before: null, after: leaveType.requiresDocument },
      isActive: { before: null, after: leaveType.isActive },
    };

    await addLog(
      userId,
      tenantId,
      "CREATE",
      "LeaveType",
      leaveType.id,
      changes,
      req
    );

    res.status(201).json({
      success: true,
      message: "Leave type created successfully",
      data: leaveType,
    });
  } catch (error) {
    logger.error(`Error creating leave type: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
    });

    next(error);
  }
};

export const updateLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const {
      name,
      description,
      color,
      isPaid,
      deductsFromAnnual,
      requiresDocument,
      isActive,
    } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }

    // Fetch existing leave type
    const existingLeaveType = await prisma.leaveType.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!existingLeaveType) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave type not found",
      });
    }

    const updateData = {};

    // Validate and set name
    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Name cannot be empty",
        });
      }
      updateData.name = name.trim();
    }

    // Validate and set description
    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    // Validate and set color
    if (color !== undefined) {
      if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Color must be a valid hex color code (e.g., #FF5733)",
        });
      }
      updateData.color = color || null;
    }

    // Validate and set boolean fields
    if (isPaid !== undefined) {
      if (typeof isPaid !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "isPaid must be a boolean value",
        });
      }
      updateData.isPaid = isPaid;
    }

    if (deductsFromAnnual !== undefined) {
      if (typeof deductsFromAnnual !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "deductsFromAnnual must be a boolean value",
        });
      }
      updateData.deductsFromAnnual = deductsFromAnnual;
    }

    if (requiresDocument !== undefined) {
      if (typeof requiresDocument !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "requiresDocument must be a boolean value",
        });
      }
      updateData.requiresDocument = requiresDocument;
    }

    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "isActive must be a boolean value",
        });
      }
      updateData.isActive = isActive;
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "No valid fields to update",
      });
    }

    // Perform update
    const updatedLeaveType = await prisma.leaveType.update({
      where: { id },
      data: updateData,
    });

    logger.info(`Updated leave type with ID: ${id} for tenant ${tenantId}`);

    // Audit logging
    const changes = getChangesDiff(existingLeaveType, updatedLeaveType);
    await addLog(userId, tenantId, "UPDATE", "LeaveType", id, changes, req);

    res.status(200).json({
      success: true,
      message: "Leave type updated successfully",
      data: updatedLeaveType,
    });
  } catch (error) {
    logger.error(`Error updating leave type: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      leaveTypeId: req.params?.id,
    });

    next(error);
  }
};

export const deleteLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }

    // Fetch existing leave type
    const existingLeaveType = await prisma.leaveType.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        _count: {
          select: {
            leaveRequests: true,
          },
        },
      },
    });

    if (!existingLeaveType) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave type not found",
      });
    }

    // Check if leave type is used in any leave requests
    if (existingLeaveType._count.leaveRequests > 0) {
      logger.warn(
        `Cannot delete leave type ${id} - used in ${existingLeaveType._count.leaveRequests} leave request(s)`
      );
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message:
          "Cannot delete leave type. It is currently used in leave requests.",
        data: {
          usedInRequests: existingLeaveType._count.leaveRequests,
        },
      });
    }

    // Perform soft delete
    const deletedLeaveType = await prisma.leaveType.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false, // Also deactivate it
      },
    });

    logger.info(
      `Soft deleted leave type with ID: ${id} for tenant ${tenantId}`
    );

    // Audit logging
    const changes = getChangesDiff(existingLeaveType, deletedLeaveType);
    await addLog(userId, tenantId, "DELETE", "LeaveType", id, changes, req);

    res.status(200).json({
      success: true,
      message: "Leave type deleted successfully",
      data: deletedLeaveType,
    });
  } catch (error) {
    logger.error(`Error deleting leave type: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      leaveTypeId: req.params?.id,
    });

    next(error);
  }
};

// ============================================
// LEAVE REQUEST CONTROLLERS
// ============================================

export const getMyLeaveRequests = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    // Pagination parameters with validation
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit || 10, 10)),
      100
    ); // Max 100 per page
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      userId,
    };

    const [leaveRequests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          leaveType: {
            select: {
              id: true,
              name: true,
              description: true,
              color: true,
              isPaid: true,
              deductsFromAnnual: true,
              requiresDocument: true,
              isActive: true,
              deletedAt: true, // Include so mobile app can handle deleted types
            },
          },
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
            },
          },
          hr: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
            },
          },
          rejectedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
            },
          },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info(
      `Retrieved ${leaveRequests.length} leave requests for user ${userId} (page ${page}/${totalPages})`
    );

    res.status(200).json({
      success: true,
      message: "Leave requests fetched successfully",
      data: leaveRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(`Error getting my leave requests: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
    });

    next(error);
  }
};

export const getPendingLeaveRequestsForManagerApproval = async (
  req,
  res,
  next
) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    // Pagination parameters with validation
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit || 10, 10)),
      100
    ); // Max 100 per page
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      managerId: userId,
      status: "PENDING", // Keep this filter - managers only need to see what requires action
    };

    const [leaveRequests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc", // Newest first - most urgent at top
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          reason: true,
          status: true,
          createdAt: true,
          leaveType: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              employeeId: true,
              department: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info(
      `Retrieved ${leaveRequests.length} pending leave requests for manager ${userId} (page ${page}/${totalPages})`
    );

    res.status(200).json({
      success: true,
      message: "Pending leave requests fetched successfully",
      data: leaveRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(
      `Error getting pending leave requests for manager: ${error.message}`,
      {
        stack: error.stack,
        tenantId: req.user?.tenantId,
        userId: req.user?.id,
      }
    );

    next(error);
  }
};
export const getAllLeaveRequests = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }


    // Pagination parameters
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(
      Math.max(1, parseInt(req.query.limit || 20, 10)),
      100
    );
    const skip = (page - 1) * limit;

    // Query parameters for filtering
    const {
      status,
      awaitingHrApproval,
      leaveTypeId,
    } = req.query;

    const where = {
      tenantId,
      ...getDepartmentFilter(req.user)
    };

    // Filter by status (PENDING, MANAGER_APPROVED, APPROVED, REJECTED, CANCELLED)
    if (status) {
      const validStatuses = [
        "PENDING",
        "MANAGER_APPROVED",
        "APPROVED",
        "REJECTED",
        "CANCELLED",
      ];
      if (validStatuses.includes(status.toUpperCase())) {
        where.status = status.toUpperCase();
      }
    }
    
    // Filter by awaiting HR approval (status = MANAGER_APPROVED)
    if (awaitingHrApproval === "true") {
      where.status = "MANAGER_APPROVED"; // Correct status for HR approval queue
    }

    // Filter by leave type
    if (leaveTypeId) {
      where.leaveTypeId = leaveTypeId;
    }

    const [leaveRequests, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc", // Latest first
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          totalDays: true,
          reason: true,
          status: true,
          createdAt: true,
          leaveType: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              employeeId: true,
              department: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    logger.info(
      `HR user ${userId} retrieved ${leaveRequests.length} leave requests (page ${page}/${totalPages})`
    );

    res.status(200).json({
      success: true,
      message: "Leave requests fetched successfully",
      data: leaveRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error) {
    logger.error(`Error getting all leave requests: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
    });

    next(error);
  }
};

export const getLeaveRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Leave request ID is required",
      });
    }

    // Build where clause with access control
    const where = {
      id,
      tenantId,
    };

    // Regular employees can only view their own requests
    // Managers can view their team's requests
    // HR can view all requests
    if (!["HR_ADMIN", "HR_STAFF"].includes(role)) {
      // Restrict access: user must be the requester or the assigned manager
      where.OR = [
        { userId: userId }, // Requester
        { managerId: userId }, // Assigned manager
      ];
    }

    // Fetch full leave request details
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where,
      include: {
        leaveType: {
          select: {
            id: true,
            name: true,
            description: true,
            color: true,
            isPaid: true,
            deductsFromAnnual: true,
            requiresDocument: true,
            isActive: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            phone: true,
            image: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
            position: {
              select: {
                id: true,
                title: true,
                code: true,
              },
            },
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            phone: true,
            image: true,
          },
        },
        hr: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
            employeeId: true,
            phone: true,
          },
        },
        rejectedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            phone: true,
            image: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave request not found",
      });
    }

    logger.info(`Retrieved leave request ${id} for user ${userId}`);

    res.status(200).json({
      success: true,
      message: "Leave request fetched successfully",
      data: leaveRequest,
    });
  } catch (error) {
    logger.error(`Error getting leave request by ID: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      leaveRequestId: req.params?.id,
    });

    next(error);
  }
};

export const createLeaveRequest = async (req, res) => {
  const { id } = req.user;
  const tenantId = req.effectiveTenantId ?? req.user.tenantId;
  const { startDate, endDate, reason, leaveTypeId } = req.body

  try {
    // Validation: tenantId and userId are required
    if (!tenantId || !id) {
      logger.error("TenantId and id are required")
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "TenantId and id are required",
      })
    }

    // Validation: required fields
    if (!startDate || !endDate || !leaveTypeId) {
      logger.error("startDate, endDate and leaveTypeId are required")
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "startDate, endDate and leaveTypeId are required",
      })
    }

    // Parse dates
    const start = new Date(startDate)
    const end = new Date(endDate)

    // Validation: startDate <= endDate
    if (start > end) {
      logger.error("startDate must be before or equal to endDate")
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "startDate must be before or equal to endDate",
      })
    }

    // Get leave type
    const leaveType = await prisma.leaveType.findFirst({
      where: {
        id: leaveTypeId,
        tenantId,
        isActive: true,
        deletedAt: null,
      },
    })

    if (!leaveType) {
      logger.error(`Leave type not found: ${leaveTypeId}`)
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave type not found or inactive",
      })
    }

    // Get policy for advance notice check
    const policy = await prisma.annualLeavePolicy.findFirst({
      where: { tenantId },
    })

    // Check advance notice requirement
    if (policy && policy.advanceNoticeDays > 0) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const daysUntilStart = Math.ceil((start - today) / (1000 * 60 * 60 * 24))

      if (daysUntilStart < policy.advanceNoticeDays) {
        logger.error(`Insufficient advance notice: ${daysUntilStart} days, required: ${policy.advanceNoticeDays}`)
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `Leave request must be submitted at least ${policy.advanceNoticeDays} days in advance`,
        })
      }
    }

    // Check for overlapping leave requests
    const overlappingRequest = await prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        userId: id,
        status: {
          in: ["PENDING", "MANAGER_APPROVED", "APPROVED"],
        },
        OR: [
          {
            AND: [
              { startDate: { lte: end } },
              { endDate: { gte: start } },
            ],
          },
        ],
      },
    })

    if (overlappingRequest) {
      logger.error(`Overlapping leave request found: ${overlappingRequest.id}`)
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "You have an overlapping leave request",
      })
    }

    // Get or create entitlement
    const currentYear = new Date().getFullYear()
    let entitlement = await prisma.yearlyEntitlement.findFirst({
      where: {
        tenantId,
        userId: id,
        year: currentYear,
      },
      include: {
        policy: true,
      },
    })

    // If no entitlement exists, create one (lazy initialization)
    if (!entitlement) {
      if (!policy) {
        logger.error(`No leave policy found for tenant ${tenantId}`)
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Leave policy not configured for this tenant",
        })
      }

      const currentDate = new Date()
      const yearStartDate = new Date(currentYear, 0, 1)
      const yearEndDate = new Date(currentYear, 11, 31)

      let allocatedDays = 0
      let accruedDays = 0

      if (policy.accrualMethod === "FRONT_LOADED") {
        allocatedDays = policy.defaultDaysPerYear
        accruedDays = 0
      } else {
        allocatedDays = 0
        accruedDays = 0
      }

      let carryoverExpiryDate = null
      if (policy.carryoverExpiryMonths) {
        carryoverExpiryDate = new Date(
          currentYear,
          policy.carryoverExpiryMonths,
          0
        )
      }

      entitlement = await prisma.yearlyEntitlement.create({
        data: {
          tenantId,
          userId: id,
          policyId: policy.id,
          year: currentYear,
          allocatedDays,
          accruedDays,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          encashedDays: 0,
          encashmentAmount: 0,
          yearStartDate,
          yearEndDate,
          lastAccrualDate: null,
          carryoverExpiryDate,
        },
        include: {
          policy: true,
        },
      })

      logger.info(`Created yearly entitlement for user ${id}, year ${currentYear}`)
    }

    // Calculate working days
    const totalDays = await calculateWorkingDays(start, end, tenantId)

    // Check available balance if leave type deducts from annual
    if (leaveType.deductsFromAnnual) {
      const availableBalance =
        entitlement.allocatedDays +
        entitlement.accruedDays +
        entitlement.carriedOverDays +
        entitlement.adjustmentDays -
        entitlement.usedDays -
        entitlement.pendingDays

      if (totalDays > availableBalance) {
        logger.error(`Insufficient leave balance: requested ${totalDays}, available ${availableBalance}`)
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `Insufficient leave balance. Available: ${availableBalance.toFixed(1)} days, Requested: ${totalDays.toFixed(1)} days`,
        })
      }
    }

    // Handle file attachments (single or multiple via multer array)
    const attachments = []
    const files = req.files && Array.isArray(req.files) ? req.files : req.file ? [req.file] : []
    for (const file of files) {
      try {
        const filename = generateFilename(
          file.originalname,
          `leave-requests/${tenantId}/${id}`
        )
        const fileUrl = await uploadFile(file.buffer, filename, file.mimetype)
        attachments.push(fileUrl)
      } catch (error) {
        logger.error(`Error uploading leave attachment: ${error.message}`)
        return res.status(500).json({
          success: false,
          error: "File Upload Failed",
          message: "Failed to upload attachment",
        })
      }
    }

    // Get user's department manager
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        department: {
          include: {
            manager: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    })

    const managerId = user?.department?.managerId || null

    // Create leave request
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        tenantId,
        userId: id,
        leaveTypeId,
        startDate: start,
        endDate: end,
        totalDays,
        reason,
        attachments,
        managerId,
        status: "PENDING",
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
          },
        },
      },
    })

    // Update entitlement pendingDays if deductsFromAnnual
    if (leaveType.deductsFromAnnual) {
      await prisma.yearlyEntitlement.update({
        where: { id: entitlement.id },
        data: {
          pendingDays: {
            increment: totalDays,
          },
        },
      })

      logger.info(`Updated pendingDays for entitlement ${entitlement.id}: +${totalDays}`)
    }

    // Send notifications (email + in-app)
    try {
      const employeeName = leaveRequest.user.name || leaveRequest.user.employeeId || "Employee"
      const leaveTypeName = leaveRequest.leaveType.name
      const formattedStartDate = start.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
      const formattedEndDate = end.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })

      // Notify Manager (if exists)
      if (managerId && user?.department?.manager) {
        const manager = user.department.manager

        // In-app notification for manager
        await createNotification(
          tenantId,
          managerId,
          "New Leave Request Pending Approval",
          `${employeeName} has submitted a ${leaveTypeName} request for ${totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate}. Please review and approve.`,
          "LEAVE",
          `/leave`
        )

        // Email notification for manager
        if (manager.email) {
          const requestUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/leave`

          await sendLeaveRequestToManagerEmail({
            to: manager.email,
            managerName: manager.name,
            employeeName,
            leaveTypeName,
            totalDays,
            formattedStartDate,
            formattedEndDate,
            reason,
            requestUrl,
          })

          logger.info(`Email notification sent to manager ${managerId}`)
        }
      }

      await createNotification(
        tenantId,
        id,
        "Leave Request Submitted",
        `Your ${leaveTypeName} request for ${totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate} has been submitted and is pending manager approval.`,
        "LEAVE",
        null
      )

      // Email confirmation for employee
      if (leaveRequest.user.email) {

        await sendLeaveRequestConfirmationEmail({
          to: leaveRequest.user.email,
          employeeName,
          leaveTypeName,
          totalDays,
          formattedStartDate,
          formattedEndDate,
          reason,
        })

        logger.info(`Confirmation email sent to employee ${id}`)
      }
    } catch (notificationError) {
      // Log error but don't fail the request creation
      logger.error(`Error sending notifications: ${notificationError.message}`, {
        stack: notificationError.stack,
        leaveRequestId: leaveRequest.id,
      })
    }

    const leaveTypeName = leaveRequest.leaveType.name
    await recordRecentActivity(
      tenantId,
      id,
      "leave_submitted",
      `${leaveTypeName} request submitted for approval`
    )

    logger.info(`Leave request created successfully for employee ${id}`)

    res.status(201).json({
      success: true,
      message: "Leave request created successfully",
      data: leaveRequest,
    })

  } catch (error) {
    logger.error(`Error creating leave request: ${error.message}`, { stack: error.stack })
    return res.status(500).json({
      success: false,
      error: "Something went wrong",
      message: "Failed to create leave request",
    })
  }
};

export const managerApproveLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    // Fetch the leave request
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            employeeId: true,
            name: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave request not found",
      });
    }

    // Validate that user is the assigned manager
    if (leaveRequest.managerId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You are not authorized to approve this leave request",
      });
    }

    // Validate status - must be PENDING
    if (leaveRequest.status !== "PENDING") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Cannot approve leave request. Current status: ${leaveRequest.status}`,
      });
    }

    // Update leave request status
    const updatedRequest = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status: "MANAGER_APPROVED",
        managerApprovedAt: new Date(),
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
          },
        },
      },
    });

    // Audit logging
    const changes = getChangesDiff(leaveRequest, updatedRequest);
    await addLog(userId, tenantId, "UPDATE", "LeaveRequest", id, changes, req);

    await recordRecentActivity(
      tenantId,
      leaveRequest.userId,
      "approved_leave",
      "Your leave request has been approved by your manager"
    );

    logger.info(
      `Manager ${userId} approved leave request ${id} for employee ${leaveRequest.user.employeeId}`
    );

    res.status(200).json({
      success: true,
      message: "Leave request approved by manager successfully",
      data: updatedRequest,
    });
  } catch (error) {
    logger.error(`Error in manager approve leave request: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      leaveRequestId: req.params?.id,
    });

    next(error);
  }
};

export const hrApproveLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    // Fetch the leave request with related data
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            employeeId: true,
            name: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave request not found",
      });
    }

    // Validate status - must be MANAGER_APPROVED
    if (leaveRequest.status !== "MANAGER_APPROVED") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Cannot approve leave request. Current status: ${leaveRequest.status}. Manager must approve first.`,
      });
    }

    // Validate that manager has approved
    if (!leaveRequest.managerApprovedAt) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Manager approval is required before HR approval",
      });
    }

    // Start transaction to update request and balance
    const updatedRequest = await prisma.$transaction(async (tx) => {
      // Update leave request status
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          hrId: userId,
          hrApprovedAt: new Date(),
        },
        include: {
          leaveType: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
            },
          },
        },
      });

      // Update leave balance if leave type deducts from annual
      if (leaveRequest.leaveType.deductsFromAnnual) {
        const currentYear = new Date().getFullYear();

        // Get or create entitlement for current year
        let entitlement = await tx.yearlyEntitlement.findUnique({
          where: {
            tenantId_userId_year: {
              tenantId,
              userId: leaveRequest.userId,
              year: currentYear,
            },
          },
        });

        if (entitlement) {
          // Update used days and pending days
          await tx.yearlyEntitlement.update({
            where: { id: entitlement.id },
            data: {
              usedDays: {
                increment: leaveRequest.totalDays,
              },
              pendingDays: {
                decrement: leaveRequest.totalDays,
              },
            },
          });
        }
      }

      return updated;
    });

    // Audit logging
    const changes = getChangesDiff(leaveRequest, updatedRequest);
    await addLog(userId, tenantId, "UPDATE", "LeaveRequest", id, changes, req);

    await recordRecentActivity(
      tenantId,
      leaveRequest.userId,
      "approved_leave",
      "Your leave request has been approved"
    );

    logger.info(
      `HR ${userId} approved leave request ${id} for employee ${leaveRequest.user.employeeId}`
    );

    res.status(200).json({
      success: true,
      message: "Leave request approved by HR successfully",
      data: updatedRequest,
    });
  } catch (error) {
    logger.error(`Error in HR approve leave request: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      leaveRequestId: req.params?.id,
    });

    next(error);
  }
};

export const rejectLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const { id: userId, role } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    // Fetch the leave request
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            employeeId: true,
            name: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave request not found",
      });
    }

    // Validate status - can reject PENDING or MANAGER_APPROVED
    if (!["PENDING", "MANAGER_APPROVED"].includes(leaveRequest.status)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Cannot reject leave request. Current status: ${leaveRequest.status}`,
      });
    }

    // Access control: Manager can reject if they're the assigned manager
    // HR can reject any request
    const isManager = leaveRequest.managerId === userId;
    const isHR = ["HR_ADMIN", "HR_STAFF"].includes(role);

    if (!isManager && !isHR) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You are not authorized to reject this leave request",
      });
    }

    // If manager is rejecting, they can only reject PENDING requests
    if (isManager && !isHR && leaveRequest.status !== "PENDING") {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Managers can only reject pending requests",
      });
    }

    // Start transaction to update request and balance
    const result = await prisma.$transaction(async (tx) => {
      // Update leave request status
      const updatedRequest = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
        },
        include: {
          leaveType: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
            },
          },
        },
      });

      // If request was previously approved by manager and deducts from annual,
      // we need to adjust balance (pendingDays was already counted)
      if (
        leaveRequest.status === "MANAGER_APPROVED" &&
        leaveRequest.leaveType.deductsFromAnnual
      ) {
        const currentYear = new Date().getFullYear();

        const entitlement = await tx.yearlyEntitlement.findUnique({
          where: {
            tenantId_userId_year: {
              tenantId,
              userId: leaveRequest.userId,
              year: currentYear,
            },
          },
        });

        if (entitlement) {
          // Decrease pending days since it's being rejected
          await tx.yearlyEntitlement.update({
            where: { id: entitlement.id },
            data: {
              pendingDays: {
                decrement: leaveRequest.totalDays,
              },
            },
          });
        }
      }

      return updatedRequest;
    });

    // Audit logging
    const changes = getChangesDiff(leaveRequest, result);
    await addLog(userId, tenantId, "UPDATE", "LeaveRequest", id, changes, req);

    await recordRecentActivity(
      tenantId,
      leaveRequest.userId,
      "rejected_leave",
      "Your leave request has been rejected"
    );

    logger.info(
      `User ${userId} (${role}) rejected leave request ${id} for employee ${leaveRequest.user.employeeId}`
    );

    res.status(200).json({
      success: true,
      message: "Leave request rejected successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`Error in reject leave request: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      leaveRequestId: req.params?.id,
    });

    next(error);
  }
};

export const cancelLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    // Validation
    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    // Fetch the leave request
    const leaveRequest = await prisma.leaveRequest.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        leaveType: true,
        user: {
          select: {
            id: true,
            employeeId: true,
            name: true,
          },
        },
      },
    });

    if (!leaveRequest) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave request not found",
      });
    }

    // Validate that user owns the request
    if (leaveRequest.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You can only cancel your own leave requests",
      });
    }

    // Validate status - cannot cancel if already APPROVED or REJECTED or CANCELLED
    if (["APPROVED", "REJECTED", "CANCELLED"].includes(leaveRequest.status)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Cannot cancel leave request. Current status: ${leaveRequest.status}`,
      });
    }

    // Start transaction to update request and balance
    const result = await prisma.$transaction(async (tx) => {
      // Update leave request status
      const updatedRequest = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
        },
        include: {
          leaveType: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
            },
          },
        },
      });

      // If request was pending and deducts from annual, update balance
      if (
        ["PENDING", "MANAGER_APPROVED"].includes(leaveRequest.status) &&
        leaveRequest.leaveType.deductsFromAnnual
      ) {
        const currentYear = new Date().getFullYear();

        const entitlement = await tx.yearlyEntitlement.findUnique({
          where: {
            tenantId_userId_year: {
              tenantId,
              userId: leaveRequest.userId,
              year: currentYear,
            },
          },
        });

        if (entitlement) {
          // Decrease pending days since it's being cancelled
          await tx.yearlyEntitlement.update({
            where: { id: entitlement.id },
            data: {
              pendingDays: {
                decrement: leaveRequest.totalDays,
              },
            },
          });
        }
      }

      return updatedRequest;
    });

    // Audit logging
    const changes = getChangesDiff(leaveRequest, result);
    await addLog(userId, tenantId, "UPDATE", "LeaveRequest", id, changes, req);

    logger.info(
      `Employee ${userId} cancelled leave request ${id} (${leaveRequest.user.employeeId})`
    );

    res.status(200).json({
      success: true,
      message: "Leave request cancelled successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`Error in cancel leave request: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
      leaveRequestId: req.params?.id,
    });

    next(error);
  }
};

// ============================================
// LEAVE BALANCE CONTROLLERS
// ============================================

export const getMyLeaveBalance = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    if (!tenantId || !userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    const currentYear = new Date().getFullYear();

    // Get or create entitlement (lazy initialization)
    let entitlement = await prisma.yearlyEntitlement.findFirst({
      where: {
        tenantId,
        userId,
        year: currentYear,
      },
      include: {
        policy: true,
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
          },
        },
      },
    });

    // If no entitlement exists, create one
    if (!entitlement) {
      const policy = await prisma.annualLeavePolicy.findFirst({
        where: { tenantId },
      });

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Leave policy not configured for this tenant",
        });
      }

      const currentDate = new Date();
      const yearStartDate = new Date(currentYear, 0, 1);
      const yearEndDate = new Date(currentYear, 11, 31);

      let allocatedDays = 0;
      let accruedDays = 0;

      if (policy.accrualMethod === "FRONT_LOADED") {
        allocatedDays = policy.defaultDaysPerYear;
        accruedDays = 0;
      } else {
        allocatedDays = 0;
        accruedDays = 0;
      }

      let carryoverExpiryDate = null;
      if (policy.carryoverExpiryMonths) {
        carryoverExpiryDate = new Date(
          currentYear,
          policy.carryoverExpiryMonths,
          0
        );
      }

      entitlement = await prisma.yearlyEntitlement.create({
        data: {
          tenantId,
          userId,
          policyId: policy.id,
          year: currentYear,
          allocatedDays,
          accruedDays,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          encashedDays: 0,
          encashmentAmount: 0,
          yearStartDate,
          yearEndDate,
          lastAccrualDate: null,
          carryoverExpiryDate,
        },
        include: {
          policy: true,
          user: {
            select: {
              id: true,
              name: true,
              employeeId: true,
            },
          },
        },
      });

      logger.info(`Created yearly entitlement for user ${userId}, year ${currentYear}`);
    }

    // Calculate available balance
    const availableBalance =
      entitlement.allocatedDays +
      entitlement.accruedDays +
      entitlement.carriedOverDays +
      entitlement.adjustmentDays -
      entitlement.usedDays -
      entitlement.pendingDays;

    res.status(200).json({
      success: true,
      message: "Leave balance fetched successfully",
      data: {
        ...entitlement,
        availableBalance: Math.max(0, availableBalance), // Ensure non-negative
      },
    });
  } catch (error) {
    logger.error(`Error getting leave balance: ${error.message}`, {
      stack: error.stack,
      userId: req.user?.id,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get leave balance",
    });
  }
};

export const getEmployeeLeaveBalance = async (req, res) => {
  try {
    const { id: hrUserId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const { userId } = req.params;

    if (!tenantId || !hrUserId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Employee user ID is required",
      });
    }

    // Verify employee belongs to same tenant
    const employee = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        employeeId: true,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Employee not found",
      });
    }

    const currentYear = new Date().getFullYear();

    // Get entitlement
    let entitlement = await prisma.yearlyEntitlement.findFirst({
      where: {
        tenantId,
        userId,
        year: currentYear,
      },
      include: {
        policy: true,
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
          },
        },
      },
    });

    // If no entitlement exists, create one
    if (!entitlement) {
      const policy = await prisma.annualLeavePolicy.findFirst({
        where: { tenantId },
      });

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Leave policy not configured for this tenant",
        });
      }

      const currentDate = new Date();
      const yearStartDate = new Date(currentYear, 0, 1);
      const yearEndDate = new Date(currentYear, 11, 31);

      let allocatedDays = 0;
      let accruedDays = 0;

      if (policy.accrualMethod === "FRONT_LOADED") {
        allocatedDays = policy.defaultDaysPerYear;
        accruedDays = 0;
      } else {
        allocatedDays = 0;
        accruedDays = 0;
      }

      let carryoverExpiryDate = null;
      if (policy.carryoverExpiryMonths) {
        carryoverExpiryDate = new Date(
          currentYear,
          policy.carryoverExpiryMonths,
          0
        );
      }

      entitlement = await prisma.yearlyEntitlement.create({
        data: {
          tenantId,
          userId,
          policyId: policy.id,
          year: currentYear,
          allocatedDays,
          accruedDays,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          encashedDays: 0,
          encashmentAmount: 0,
          yearStartDate,
          yearEndDate,
          lastAccrualDate: null,
          carryoverExpiryDate,
        },
        include: {
          policy: true,
          user: {
            select: {
              id: true,
              name: true,
              employeeId: true,
            },
          },
        },
      });

      logger.info(`Created yearly entitlement for user ${userId}, year ${currentYear}`);
    }

    // Calculate available balance
    const availableBalance =
      entitlement.allocatedDays +
      entitlement.accruedDays +
      entitlement.carriedOverDays +
      entitlement.adjustmentDays -
      entitlement.usedDays -
      entitlement.pendingDays;

    // Audit log
    await addLog(
      hrUserId,
      tenantId,
      "READ",
      "YearlyEntitlement",
      entitlement.id,
      null,
      req
    );

    res.status(200).json({
      success: true,
      message: "Employee leave balance fetched successfully",
      data: {
        ...entitlement,
        availableBalance: Math.max(0, availableBalance), // Ensure non-negative
      },
    });
  } catch (error) {
    logger.error(`Error getting employee leave balance: ${error.message}`, {
      stack: error.stack,
      userId: req.params?.userId,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get employee leave balance",
    });
  }
};

export const adjustLeaveBalance = async (req, res) => {
  try {
    const { id: hrUserId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const { userId } = req.params;
    const { adjustmentDays, reason } = req.body;

    if (!tenantId || !hrUserId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Employee user ID is required",
      });
    }

    if (adjustmentDays === undefined || adjustmentDays === null) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "adjustmentDays is required",
      });
    }

    if (typeof adjustmentDays !== "number") {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "adjustmentDays must be a number",
      });
    }

    // Verify employee belongs to same tenant
    const employee = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        employeeId: true,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Employee not found",
      });
    }

    const currentYear = new Date().getFullYear();

    // Get or create entitlement
    let entitlement = await prisma.yearlyEntitlement.findFirst({
      where: {
        tenantId,
        userId,
        year: currentYear,
      },
      include: {
        policy: true,
      },
    });

    if (!entitlement) {
      const policy = await prisma.annualLeavePolicy.findFirst({
        where: { tenantId },
      });

      if (!policy) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Leave policy not configured for this tenant",
        });
      }

      const yearStartDate = new Date(currentYear, 0, 1);
      const yearEndDate = new Date(currentYear, 11, 31);

      let allocatedDays = 0;
      let accruedDays = 0;

      if (policy.accrualMethod === "FRONT_LOADED") {
        allocatedDays = policy.defaultDaysPerYear;
        accruedDays = 0;
      } else {
        allocatedDays = 0;
        accruedDays = 0;
      }

      let carryoverExpiryDate = null;
      if (policy.carryoverExpiryMonths) {
        carryoverExpiryDate = new Date(
          currentYear,
          policy.carryoverExpiryMonths,
          0
        );
      }

      entitlement = await prisma.yearlyEntitlement.create({
        data: {
          tenantId,
          userId,
          policyId: policy.id,
          year: currentYear,
          allocatedDays,
          accruedDays,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          encashedDays: 0,
          encashmentAmount: 0,
          yearStartDate,
          yearEndDate,
          lastAccrualDate: null,
          carryoverExpiryDate,
        },
        include: {
          policy: true,
        },
      });

      logger.info(`Created yearly entitlement for user ${userId}, year ${currentYear}`);
    }

    // Get old value for audit log
    const oldAdjustmentDays = entitlement.adjustmentDays;
    const newAdjustmentDays = oldAdjustmentDays + adjustmentDays;

    // Update entitlement
    const updatedEntitlement = await prisma.yearlyEntitlement.update({
      where: { id: entitlement.id },
      data: {
        adjustmentDays: newAdjustmentDays,
      },
      include: {
        policy: true,
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
          },
        },
      },
    });

    // Calculate new available balance
    const availableBalance =
      updatedEntitlement.allocatedDays +
      updatedEntitlement.accruedDays +
      updatedEntitlement.carriedOverDays +
      updatedEntitlement.adjustmentDays -
      updatedEntitlement.usedDays -
      updatedEntitlement.pendingDays;

    // Audit log
    await addLog(
      hrUserId,
      tenantId,
      "UPDATE",
      "YearlyEntitlement",
      entitlement.id,
      {
        adjustmentDays: {
          before: oldAdjustmentDays,
          after: newAdjustmentDays,
          change: adjustmentDays,
        },
        reason: reason || "Manual balance adjustment",
      },
      req
    );

    logger.info(
      `Leave balance adjusted for user ${userId} by HR ${hrUserId}: ${adjustmentDays > 0 ? "+" : ""}${adjustmentDays} days. Reason: ${reason || "N/A"}`
    );

    res.status(200).json({
      success: true,
      message: "Leave balance adjusted successfully",
      data: {
        ...updatedEntitlement,
        availableBalance: Math.max(0, availableBalance), // Ensure non-negative
        adjustment: {
          previousAdjustmentDays: oldAdjustmentDays,
          adjustmentAmount: adjustmentDays,
          newAdjustmentDays: newAdjustmentDays,
          reason: reason || null,
        },
      },
    });
  } catch (error) {
    logger.error(`Error adjusting leave balance: ${error.message}`, {
      stack: error.stack,
      userId: req.params?.userId,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to adjust leave balance",
    });
  }
};



// ... existing code ends at line 2727 ...

export const getAllLeaveBalances = async (req, res) => {
  try {
    const { id: hrUserId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;

    if (!tenantId || !hrUserId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    const currentYear = new Date().getFullYear();
    const { year, page = 1, limit = 50 } = req.query;
    const targetYear = year ? parseInt(year) : currentYear;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all employees in the tenant
    const employees = await prisma.user.findMany({
      where: {
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        employeeId: true,
        email: true,
      },
      skip,
      take: parseInt(limit),
      orderBy: {
        name: "asc",
      },
    });

    // Get entitlements for all employees
    const entitlements = await prisma.yearlyEntitlement.findMany({
      where: {
        tenantId,
        year: targetYear,
        userId: {
          in: employees.map((emp) => emp.id),
        },
      },
      include: {
        policy: true,
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            email: true,
          },
        },
      },
    });

    // Create a map of userId to entitlement
    const entitlementMap = new Map();
    entitlements.forEach((ent) => {
      entitlementMap.set(ent.userId, ent);
    });

    // Build response with balances
    const balances = employees.map((employee) => {
      const entitlement = entitlementMap.get(employee.id);

      if (!entitlement) {
        return {
          userId: employee.id,
          user: employee,
          year: targetYear,
          entitlement: null,
          availableBalance: 0,
          allocatedDays: 0,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          encashedDays: 0,
          encashmentAmount: 0,
        };
      }

      const availableBalance =
        entitlement.allocatedDays +
        entitlement.accruedDays +
        entitlement.carriedOverDays +
        entitlement.adjustmentDays -
        entitlement.usedDays -
        entitlement.pendingDays;

      return {
        userId: employee.id,
        user: employee,
        year: targetYear,
        entitlement: {
          id: entitlement.id,
          policy: entitlement.policy,
          yearStartDate: entitlement.yearStartDate,
          yearEndDate: entitlement.yearEndDate,
          lastAccrualDate: entitlement.lastAccrualDate,
          carryoverExpiryDate: entitlement.carryoverExpiryDate,
        },
        availableBalance: Math.max(0, availableBalance),
        allocatedDays: entitlement.allocatedDays,
        accruedDays: entitlement.accruedDays,
        carriedOverDays: entitlement.carriedOverDays,
        adjustmentDays: entitlement.adjustmentDays,
        usedDays: entitlement.usedDays,
        pendingDays: entitlement.pendingDays,
        encashedDays: entitlement.encashedDays,
        encashmentAmount: entitlement.encashmentAmount,
      };
    });

    const totalEmployees = await prisma.user.count({
      where: {
        tenantId,
        isDeleted: false,
      },
    });

    await addLog(
      hrUserId,
      tenantId,
      "READ",
      "YearlyEntitlement",
      null,
      { year: targetYear, count: balances.length },
      req
    );

    res.status(200).json({
      success: true,
      message: "Leave balances fetched successfully",
      data: balances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalEmployees,
        totalPages: Math.ceil(totalEmployees / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error(`Error getting all leave balances: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get leave balances",
    });
  }
};

export const initializeLeaveEntitlement = async (req, res) => {
  try {
    const { id: hrUserId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
    const { userId } = req.params;
    const { year } = req.body;

    if (!tenantId || !hrUserId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Tenant ID and user ID are required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Employee user ID is required",
      });
    }

    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    const employee = await prisma.user.findFirst({
      where: {
        id: userId,
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        name: true,
        employeeId: true,
        createdAt: true,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Employee not found",
      });
    }

    const existingEntitlement = await prisma.yearlyEntitlement.findFirst({
      where: {
        tenantId,
        userId,
        year: targetYear,
      },
    });

    if (existingEntitlement) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Entitlement for year ${targetYear} already exists for this employee`,
        data: existingEntitlement,
      });
    }

    const policy = await prisma.annualLeavePolicy.findFirst({
      where: { tenantId },
    });

    if (!policy) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave policy not configured for this tenant",
      });
    }

    const employeeJoinDate = new Date(employee.createdAt);
    const joinYear = employeeJoinDate.getFullYear();
    const yearStartDate = new Date(targetYear, 0, 1);
    const yearEndDate = new Date(targetYear, 11, 31);

    let allocatedDays = 0;
    let accruedDays = 0;
    let actualYearStartDate = yearStartDate;

    if (policy.accrualMethod === "FRONT_LOADED") {
      allocatedDays = policy.defaultDaysPerYear;
      accruedDays = 0;

      if (joinYear === targetYear) {
        const monthsRemaining = 12 - employeeJoinDate.getMonth();
        allocatedDays = (policy.defaultDaysPerYear / 12) * monthsRemaining;
        actualYearStartDate = employeeJoinDate;
      }
    } else {
      allocatedDays = 0;
      accruedDays = 0;

      if (joinYear === targetYear) {
        actualYearStartDate = employeeJoinDate;
      }
    }

    let carryoverExpiryDate = null;
    if (policy.carryoverExpiryMonths) {
      carryoverExpiryDate = new Date(
        targetYear,
        policy.carryoverExpiryMonths,
        0
      );
    }

    const entitlement = await prisma.yearlyEntitlement.create({
      data: {
        tenantId,
        userId,
        policyId: policy.id,
        year: targetYear,
        allocatedDays,
        accruedDays,
        carriedOverDays: 0,
        adjustmentDays: 0,
        usedDays: 0,
        pendingDays: 0,
        encashedDays: 0,
        encashmentAmount: 0,
        yearStartDate: actualYearStartDate,
        yearEndDate,
        lastAccrualDate: null,
        carryoverExpiryDate,
      },
      include: {
        policy: true,
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
          },
        },
      },
    });

    const availableBalance =
      entitlement.allocatedDays +
      entitlement.accruedDays +
      entitlement.carriedOverDays +
      entitlement.adjustmentDays -
      entitlement.usedDays -
      entitlement.pendingDays;

    await addLog(
      hrUserId,
      tenantId,
      "CREATE",
      "YearlyEntitlement",
      entitlement.id,
      {
        userId,
        year: targetYear,
        allocatedDays,
        accrualMethod: policy.accrualMethod,
        reason: "Manual initialization by HR",
      },
      req
    );

    logger.info(
      `Leave entitlement initialized for user ${userId}, year ${targetYear} by HR ${hrUserId}`
    );

    res.status(201).json({
      success: true,
      message: "Leave entitlement initialized successfully",
      data: {
        ...entitlement,
        availableBalance: Math.max(0, availableBalance),
      },
    });
  } catch (error) {
    logger.error(`Error initializing leave entitlement: ${error.message}`, {
      stack: error.stack,
      userId: req.params?.userId,
    });
    return res.status(500).json({ success: false, error: "Something went wrong", message: "Failed to initialize leave entitlement" })
  }
}

export const getLeaveStats = async (req, res) => {
  try {
    const { id: userId } = req.user;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;


    const currentYear = new Date().getFullYear();

    // Get or create yearly entitlement (same pattern as getLeaveBalance)
    let entitlement = await prisma.yearlyEntitlement.findFirst({
      where: {
        tenantId,
        userId,
        year: currentYear,
      },
      include: { policy: true },
    });

    if (!entitlement) {
      const policy = await prisma.annualLeavePolicy.findFirst({
        where: { tenantId },
      });
      if (!policy) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Leave policy not configured for this tenant",
        });
      }
      const yearStartDate = new Date(currentYear, 0, 1);
      const yearEndDate = new Date(currentYear, 11, 31);
      let carryoverExpiryDate = null;
      if (policy.carryoverExpiryMonths != null) {
        carryoverExpiryDate = new Date(currentYear, policy.carryoverExpiryMonths, 0);
      }
      const allocatedDays =
        policy.accrualMethod === "FRONT_LOADED" ? policy.defaultDaysPerYear : 0;
      entitlement = await prisma.yearlyEntitlement.create({
        data: {
          tenantId,
          userId,
          policyId: policy.id,
          year: currentYear,
          allocatedDays,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          encashedDays: 0,
          encashmentAmount: 0,
          yearStartDate,
          yearEndDate,
          lastAccrualDate: null,
          carryoverExpiryDate,
        },
        include: { policy: true },
      });
      logger.info(`Created yearly entitlement for user ${userId}, year ${currentYear}`);
    }

    const totalDays =
      entitlement.allocatedDays +
      entitlement.accruedDays +
      entitlement.carriedOverDays +
      entitlement.adjustmentDays;
    const daysTaken = entitlement.usedDays;

    const [pendingCount, approvedCount] = await Promise.all([
      prisma.leaveRequest.count({
        where: {
          tenantId,
          userId,
          cancelledAt: null,
          status: { in: ["PENDING", "MANAGER_APPROVED"] },
        },
      }),
      prisma.leaveRequest.count({
        where: {
          tenantId,
          userId,
          cancelledAt: null,
          status: "APPROVED",
        },
      }),
    ]);

    const policy = entitlement.policy;
    const defaultDaysPerYear = policy?.defaultDaysPerYear ?? 21;
    const accrualMethod = policy?.accrualMethod ?? "FRONT_LOADED";
    const carryoverType = policy?.carryoverType ?? "LIMITED";

    return res.status(200).json({
      success: true,
      message: "Leave stats fetched successfully",
      data: {
        totalDays,
        daysTaken,
        pendingCount,
        approvedCount,
        defaultDaysPerYear,
        accrualMethod,
        carryoverType,
      },
    });
  } catch (error) {
    logger.error(`Error getting leave stats: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
      userId: req.user?.id,
    });
    return res.status(500).json({
      success: false,
      error: "Something went wrong",
      message: "Failed to get leave stats",
    });
  }
};