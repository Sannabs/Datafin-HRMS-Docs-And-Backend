import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

// ============================================
// LEAVE POLICY CONTROLLERS
// ============================================

export const getLeavePolicy = async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;

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

export const updateLeavePolicy = async (req, res) => {
  try {
    const { tenantId, id: userId } = req.user;
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
    // Handle Prisma errors
    if (error.code === "P2025") {
      logger.warn(`Leave policy not found for update`);
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave policy not found",
      });
    }

    if (error.code === "P2002") {
      logger.warn(`Unique constraint violation: ${error.meta?.target}`);
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "A record with this value already exists",
      });
    }

    logger.error(`Error updating leave policy: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update leave policy",
    });
  }
};

// ============================================
// LEAVE TYPE CONTROLLERS
// ============================================

export const getAllLeaveTypes = async (req, res) => {
  // TODO
};

export const getLeaveTypeById = async (req, res) => {
  // TODO
};

export const createLeaveType = async (req, res) => {
  // TODO
};

export const updateLeaveType = async (req, res) => {
  // TODO
};

export const deleteLeaveType = async (req, res) => {
  // TODO
};

// ============================================
// LEAVE REQUEST CONTROLLERS
// ============================================

export const getAllLeaveRequests = async (req, res) => {
  // TODO
};

export const getMyLeaveRequests = async (req, res) => {
  // TODO
};

export const getPendingLeaveRequests = async (req, res) => {
  // TODO
};

export const getLeaveRequestById = async (req, res) => {
  // TODO
};

export const createLeaveRequest = async (req, res) => {
  // TODO
};

export const managerApproveLeaveRequest = async (req, res) => {
  // TODO
};

export const hrApproveLeaveRequest = async (req, res) => {
  // TODO
};

export const rejectLeaveRequest = async (req, res) => {
  // TODO
};

export const cancelLeaveRequest = async (req, res) => {
  // TODO
};

// ============================================
// LEAVE BALANCE CONTROLLERS
// ============================================

export const getMyLeaveBalance = async (req, res) => {
  // TODO
};

export const getEmployeeLeaveBalance = async (req, res) => {
  // TODO
};

export const getAllLeaveBalances = async (req, res) => {
  // TODO
};

export const adjustLeaveBalance = async (req, res) => {
  // TODO
};

export const initializeLeaveEntitlement = async (req, res) => {
  // TODO
};
