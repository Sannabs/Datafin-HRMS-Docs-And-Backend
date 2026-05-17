import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import { generateFilename, uploadFile } from "../config/storage.config.js";
import { calculateWorkingDays } from "../utils/working-days.utils.js";
import { createNotification } from "../services/notification.service.js";
import { sendLeaveRequestToManagerEmail } from "../views/sendLeaveRequestToManagerEmail.js";
import { sendLeaveRequestConfirmationEmail } from "../views/sendLeaveRequestConfirmationEmail.js";
import { sendLeaveManagerApprovedEmail } from "../views/sendLeaveManagerApprovedEmail.js";
import { sendLeaveApprovedEmail } from "../views/sendLeaveApprovedEmail.js";
import { sendLeaveRejectedEmail } from "../views/sendLeaveRejectedEmail.js";
import { sendLeavePendingHrReviewEmail } from "../views/sendLeavePendingHrReviewEmail.js";
import { recordRecentActivity } from "../utils/activity.util.js";
import { getDepartmentFilter } from "../utils/access-control.utils.js";
import { requestOverlapsBlackout, getBlackoutSegmentsForYear, getBlackoutWindowLabel } from "../utils/leave.util.js";
import { EMPLOYEE_STATUSES_ACTIVE_FOR_WORK } from "../utils/employee-status.util.js";
import {
  computeInitialAllocation,
  computeAvailableBalance,
  leaveTypePool,
} from "../services/leave-allocation.service.js";

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
      "VIEW",
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
      requireManagerApproval,
      blackoutStartMonth,
      blackoutStartDay,
      blackoutEndMonth,
      blackoutEndDay,
      sickLeaveAllocationEnabled,
      allocatedSickDaysPerYear,
      applyToExistingEntitlements,
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

    // Validate and set requireManagerApproval (two-tier vs single-tier approval)
    if (requireManagerApproval !== undefined) {
      if (typeof requireManagerApproval !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "requireManagerApproval must be a boolean value",
        });
      }
      updateData.requireManagerApproval = requireManagerApproval;
    }

    const validateMonth = (v) =>
      v === null ||
      (typeof v === "number" &&
        Number.isInteger(v) &&
        v >= 1 &&
        v <= 12);
    const validateDay = (v) =>
      v === null ||
      (typeof v === "number" &&
        Number.isInteger(v) &&
        v >= 1 &&
        v <= 31);
    if (blackoutStartMonth !== undefined) {
      if (!validateMonth(blackoutStartMonth)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "blackoutStartMonth must be null or an integer 1-12",
        });
      }
      updateData.blackoutStartMonth = blackoutStartMonth;
    }
    if (blackoutStartDay !== undefined) {
      if (!validateDay(blackoutStartDay)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "blackoutStartDay must be null or an integer 1-31",
        });
      }
      updateData.blackoutStartDay = blackoutStartDay;
    }
    if (blackoutEndMonth !== undefined) {
      if (!validateMonth(blackoutEndMonth)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "blackoutEndMonth must be null or an integer 1-12",
        });
      }
      updateData.blackoutEndMonth = blackoutEndMonth;
    }
    if (blackoutEndDay !== undefined) {
      if (!validateDay(blackoutEndDay)) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "blackoutEndDay must be null or an integer 1-31",
        });
      }
      updateData.blackoutEndDay = blackoutEndDay;
    }

    // Validate and set sickLeaveAllocationEnabled
    if (sickLeaveAllocationEnabled !== undefined) {
      if (typeof sickLeaveAllocationEnabled !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "sickLeaveAllocationEnabled must be a boolean value",
        });
      }
      updateData.sickLeaveAllocationEnabled = sickLeaveAllocationEnabled;
    }

    // Validate and set allocatedSickDaysPerYear
    if (allocatedSickDaysPerYear !== undefined) {
      if (
        typeof allocatedSickDaysPerYear !== "number" ||
        allocatedSickDaysPerYear < 0
      ) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "allocatedSickDaysPerYear must be a non-negative number",
        });
      }
      updateData.allocatedSickDaysPerYear = allocatedSickDaysPerYear;
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

    // Optional bulk propagation: re-derive allocations for current+future year entitlements
    // when allocation-affecting fields changed and HR explicitly opts in.
    let propagationSummary = null;
    const allocationFieldsChanged =
      updateData.defaultDaysPerYear !== undefined ||
      updateData.allocatedSickDaysPerYear !== undefined ||
      updateData.sickLeaveAllocationEnabled !== undefined ||
      updateData.accrualMethod !== undefined;

    if (applyToExistingEntitlements === true && allocationFieldsChanged) {
      propagationSummary = await propagateAllocationToEntitlements({
        tenantId,
        policy: updatedPolicy,
      });
    }

    // Audit logging
    const changes = getChangesDiff(existingPolicy, updatedPolicy);
    if (propagationSummary) {
      changes.propagation = propagationSummary;
    }
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
      `Leave policy updated for tenant ${tenantId} by user ${userId}` +
        (propagationSummary
          ? ` — propagated to ${propagationSummary.updated} entitlement(s)`
          : "")
    );

    res.status(200).json({
      success: true,
      message: "Leave policy updated successfully",
      data: updatedPolicy,
      propagation: propagationSummary,
    });
  } catch (error) {
    logger.error(`Error updating leave policy: ${error.message}`, {
      stack: error.stack,
      tenantId: req.user?.tenantId,
    });

    next(error); // Let global error handler deal with it
  }
};

/**
 * Recompute allocatedDays/allocatedSickDays for current and future year entitlements
 * after an allocation-affecting policy update.
 *
 * Rules:
 * - Only touches current year and future years (past years are locked).
 * - Only updates entitlements for employees with an active employment status.
 * - Floors `allocatedDays` at `usedDays + pendingDays` (no negative available).
 * - Floors `allocatedSickDays` at `usedSickDays + pendingSickDays`.
 * - Preserves `adjustmentDays` and `sickAdjustmentDays` (manual HR overrides).
 * - Re-applies the tenure gate via the allocation helper — employees still in their
 *   first 12 months keep 0 even if the policy default changes.
 */
async function propagateAllocationToEntitlements({ tenantId, policy }) {
  const currentYear = new Date().getFullYear();

  const entitlements = await prisma.yearlyEntitlement.findMany({
    where: {
      tenantId,
      year: { gte: currentYear },
      user: {
        isDeleted: false,
        status: { in: EMPLOYEE_STATUSES_ACTIVE_FOR_WORK },
      },
    },
    include: {
      user: { select: { id: true, employeeId: true, hireDate: true } },
    },
  });

  const affected = [];
  let updated = 0;
  let flooredAnnual = 0;
  let flooredSick = 0;
  let skippedIneligible = 0;

  for (const ent of entitlements) {
    const alloc = computeInitialAllocation({
      user: { hireDate: ent.user.hireDate },
      policy,
      year: ent.year,
    });

    const annualFloor = ent.usedDays + ent.pendingDays;
    const sickFloor = (ent.usedSickDays ?? 0) + (ent.pendingSickDays ?? 0);

    let nextAllocatedDays = alloc.allocatedDays;
    let nextAllocatedSickDays = alloc.allocatedSickDays;
    let didFloorAnnual = false;
    let didFloorSick = false;

    if (nextAllocatedDays < annualFloor) {
      nextAllocatedDays = annualFloor;
      didFloorAnnual = true;
    }
    if (nextAllocatedSickDays < sickFloor) {
      nextAllocatedSickDays = sickFloor;
      didFloorSick = true;
    }

    const noChange =
      nextAllocatedDays === ent.allocatedDays &&
      nextAllocatedSickDays === (ent.allocatedSickDays ?? 0);

    if (noChange) {
      if (!alloc.eligible) skippedIneligible++;
      continue;
    }

    await prisma.yearlyEntitlement.update({
      where: { id: ent.id },
      data: {
        allocatedDays: nextAllocatedDays,
        allocatedSickDays: nextAllocatedSickDays,
      },
    });

    updated++;
    if (didFloorAnnual) flooredAnnual++;
    if (didFloorSick) flooredSick++;
    affected.push({
      userId: ent.user.id,
      employeeId: ent.user.employeeId,
      year: ent.year,
      before: {
        allocatedDays: ent.allocatedDays,
        allocatedSickDays: ent.allocatedSickDays ?? 0,
      },
      after: {
        allocatedDays: nextAllocatedDays,
        allocatedSickDays: nextAllocatedSickDays,
      },
      flooredAnnual: didFloorAnnual,
      flooredSick: didFloorSick,
    });
  }

  return {
    totalAffected: entitlements.length,
    updated,
    flooredAnnual,
    flooredSick,
    skippedIneligible,
    affectedEmployees: affected,
  };
}

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
      deductsFromSickAllocation,
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

    if (
      deductsFromSickAllocation !== undefined &&
      typeof deductsFromSickAllocation !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "deductsFromSickAllocation must be a boolean value",
      });
    }

    // A leave type deducts from annual XOR sick XOR neither. Default deductsFromAnnual is true,
    // so callers enabling sick must explicitly disable annual.
    const resolvedDeductsFromAnnual =
      deductsFromAnnual !== undefined ? deductsFromAnnual : true;
    const resolvedDeductsFromSick =
      deductsFromSickAllocation !== undefined ? deductsFromSickAllocation : false;
    if (resolvedDeductsFromAnnual && resolvedDeductsFromSick) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message:
          "deductsFromAnnual and deductsFromSickAllocation are mutually exclusive",
      });
    }

    const leaveType = await prisma.leaveType.create({
      data: {
        tenantId,
        name: name.trim(),
        description: description?.trim() || null,
        color: color || null,
        isPaid: isPaid !== undefined ? isPaid : true,
        deductsFromAnnual: resolvedDeductsFromAnnual,
        deductsFromSickAllocation: resolvedDeductsFromSick,
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
      deductsFromSickAllocation: {
        before: null,
        after: leaveType.deductsFromSickAllocation,
      },
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
      deductsFromSickAllocation,
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

    if (deductsFromSickAllocation !== undefined) {
      if (typeof deductsFromSickAllocation !== "boolean") {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "deductsFromSickAllocation must be a boolean value",
        });
      }
      updateData.deductsFromSickAllocation = deductsFromSickAllocation;
    }

    // Enforce mutual exclusion against the would-be final state (incoming or existing).
    const nextDeductsFromAnnual =
      updateData.deductsFromAnnual !== undefined
        ? updateData.deductsFromAnnual
        : existingLeaveType.deductsFromAnnual;
    const nextDeductsFromSick =
      updateData.deductsFromSickAllocation !== undefined
        ? updateData.deductsFromSickAllocation
        : existingLeaveType.deductsFromSickAllocation;
    if (nextDeductsFromAnnual && nextDeductsFromSick) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message:
          "deductsFromAnnual and deductsFromSickAllocation are mutually exclusive",
      });
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

    // Single-tier mode: when policy does not require manager approval, return empty queue
    const policy = await prisma.annualLeavePolicy.findFirst({
      where: { tenantId },
      select: { requireManagerApproval: true },
    });
    if (policy && policy.requireManagerApproval === false) {
      return res.status(200).json({
        success: true,
        message: "Pending leave requests fetched successfully",
        data: [],
        pagination: {
          page: 1,
          limit,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }

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

    // HR, department heads (scoped by getDepartmentFilter), or SUPER_ADMIN with tenant
    const canViewAll =
      ["HR_ADMIN", "HR_STAFF", "DEPARTMENT_ADMIN"].includes(role) ||
      (role === "SUPER_ADMIN" && req.effectiveTenantId);
    if (!canViewAll) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You are not authorized to view leave requests",
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
      userId: filterUserId,
      search: searchParam,
    } = req.query;

    const userDeptFilter = await getDepartmentFilter(req.user);
    const search =
      typeof searchParam === "string" && searchParam.trim()
        ? searchParam.trim()
        : "";

    const where = {
      tenantId,
    };

    if (filterUserId && String(filterUserId).trim()) {
      where.userId = String(filterUserId).trim();
    }

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

    if (search) {
      where.AND = [
        {
          OR: [
            {
              user: {
                ...userDeptFilter,
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  { employeeId: { contains: search, mode: "insensitive" } },
                ],
              },
            },
            {
              leaveType: {
                name: { contains: search, mode: "insensitive" },
              },
            },
          ],
        },
      ];
    } else {
      where.user = userDeptFilter;
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
          managerId: true,
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
              image: true,
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

    // When tenantId is missing (e.g. SUPER_ADMIN not impersonating), resolve from the request and enforce access
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const stub = await prisma.leaveRequest.findUnique({
        where: { id },
        select: { tenantId: true, userId: true, managerId: true },
      });
      if (!stub) {
        return res.status(404).json({
          success: false,
          error: "Not Found",
          message: "Leave request not found",
        });
      }
      const canAccess = stub.userId === userId || stub.managerId === userId;
      if (!canAccess) {
        return res.status(403).json({
          success: false,
          error: "Forbidden",
          message: "You are not authorized to view this leave request",
        });
      }
      resolvedTenantId = stub.tenantId;
    }

    // Build where clause with access control
    const where = {
      id,
      tenantId: resolvedTenantId,
    };

    // Regular employees can only view their own requests
    // Managers can view their team's requests
    // HR (or SUPER_ADMIN impersonating tenant) can view all requests
    const isHRForLeave =
      ["HR_ADMIN", "HR_STAFF"].includes(role) ||
      (role === "SUPER_ADMIN" && req.effectiveTenantId);
    if (!isHRForLeave) {
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
              },
            },
            position: {
              select: {
                id: true,
                title: true,
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

    const hasFiles = (req.files?.length ?? 0) > 0 || !!req.file;
    if (leaveType.requiresDocument && !hasFiles) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "This leave type requires a supporting document to be uploaded",
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

    if (leaveType.deductsFromAnnual && policy && requestOverlapsBlackout(policy, start, end)) {
      const windowLabel = getBlackoutWindowLabel(policy);
      logger.error(`Leave request overlaps recurring blackout window (${windowLabel})`);
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Annual leave cannot be taken during the blackout period (${windowLabel} each year).`,
      });
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

      const yearStartDate = new Date(currentYear, 0, 1)
      const yearEndDate = new Date(currentYear, 11, 31)

      const userRecord = await prisma.user.findUnique({
        where: { id },
        select: { hireDate: true },
      })

      const alloc = computeInitialAllocation({
        user: userRecord,
        policy,
        year: currentYear,
      })

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
          allocatedDays: alloc.allocatedDays,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          allocatedSickDays: alloc.allocatedSickDays,
          usedSickDays: 0,
          pendingSickDays: 0,
          sickAdjustmentDays: 0,
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

    // Check available balance against the pool this leave type draws from.
    // Pools are mutually exclusive at the LeaveType level (annual XOR sick XOR neither).
    const pool = leaveTypePool(leaveType)
    if (pool !== "none") {
      const balances = computeAvailableBalance(entitlement, leaveType)
      const availableBalance = balances.forLeaveType
      if (totalDays > availableBalance) {
        const poolLabel = pool === "sick" ? "sick leave" : "leave"
        logger.error(`Insufficient ${poolLabel} balance: requested ${totalDays}, available ${availableBalance}`)
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: `Insufficient ${poolLabel} balance. Available: ${availableBalance.toFixed(1)} days, Requested: ${totalDays.toFixed(1)} days`,
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

    // Increment pending days on the pool this leave type targets.
    if (pool === "annual") {
      await prisma.yearlyEntitlement.update({
        where: { id: entitlement.id },
        data: { pendingDays: { increment: totalDays } },
      })
      logger.info(`Updated pendingDays for entitlement ${entitlement.id}: +${totalDays}`)
    } else if (pool === "sick") {
      await prisma.yearlyEntitlement.update({
        where: { id: entitlement.id },
        data: { pendingSickDays: { increment: totalDays } },
      })
      logger.info(`Updated pendingSickDays for entitlement ${entitlement.id}: +${totalDays}`)
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

      const isTwoTier = !policy || policy.requireManagerApproval;
      const requestUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/leave`

      if (isTwoTier) {
        // Two-tier: notify the assigned manager
        if (managerId && user?.department?.manager) {
          const manager = user.department.manager

          await createNotification(
            tenantId,
            managerId,
            "New Leave Request Pending Approval",
            `${employeeName} has submitted a ${leaveTypeName} request for ${totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate}. Please review and approve.`,
            "LEAVE",
            `/leave`
          )

          if (manager.email) {
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
      } else {
        // Single-tier: skip manager, notify HR directly
        const hrUsers = await prisma.user.findMany({
          where: { tenantId, role: { in: ["HR_ADMIN", "HR_STAFF"] }, deletedAt: null },
          select: { id: true, name: true, email: true },
        })

        for (const hrUser of hrUsers) {
          await createNotification(
            tenantId,
            hrUser.id,
            "New Leave Request Pending Approval",
            `${employeeName} has submitted a ${leaveTypeName} request for ${totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate}. Please review and approve.`,
            "LEAVE",
            "/leave"
          )

          if (hrUser.email) {
            await sendLeaveRequestToManagerEmail({
              to: hrUser.email,
              managerName: hrUser.name,
              employeeName,
              leaveTypeName,
              totalDays,
              formattedStartDate,
              formattedEndDate,
              reason,
              requestUrl,
            })
          }
        }

        logger.info(`Single-tier: notified ${hrUsers.length} HR user(s) of new leave request`)
      }

      await createNotification(
        tenantId,
        id,
        "Leave Request Submitted",
        `Your ${leaveTypeName} request for ${totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate} has been submitted and is pending ${isTwoTier ? "manager" : "HR"} approval.`,
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

    // Enforce policy — block manager approval when single-tier is configured
    const policy = await prisma.annualLeavePolicy.findFirst({ where: { tenantId } });
    if (policy && !policy.requireManagerApproval) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Manager approval is not required under the current leave policy",
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

    try {
      const employeeName = updatedRequest.user.name || updatedRequest.user.employeeId || "Employee";
      const leaveTypeName = updatedRequest.leaveType.name;
      const formattedStartDate = updatedRequest.startDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const formattedEndDate = updatedRequest.endDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      await createNotification(
        tenantId,
        leaveRequest.userId,
        "Leave Request Manager Approved",
        `Your ${leaveTypeName} request for ${leaveRequest.totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate} has been approved by your manager and is now pending HR review.`,
        "LEAVE",
        null
      );

      if (updatedRequest.user.email) {
        await sendLeaveManagerApprovedEmail({
          to: updatedRequest.user.email,
          employeeName,
          leaveTypeName,
          totalDays: leaveRequest.totalDays,
          formattedStartDate,
          formattedEndDate,
        });
      }

      const hrUsers = await prisma.user.findMany({
        where: { tenantId, role: { in: ["HR_ADMIN", "HR_STAFF"] }, deletedAt: null },
        select: { id: true, name: true, email: true },
      });

      const requestUrl = `${process.env.CLIENT_URL || "http://localhost:3000"}/leave`;

      for (const hrUser of hrUsers) {
        await createNotification(
          tenantId,
          hrUser.id,
          "Leave Request Pending HR Review",
          `${employeeName}'s ${leaveTypeName} request for ${leaveRequest.totalDays.toFixed(1)} day(s) has been manager-approved and requires your review.`,
          "LEAVE",
          "/leave"
        );
        if (hrUser.email) {
          await sendLeavePendingHrReviewEmail({
            to: hrUser.email,
            hrName: hrUser.name,
            employeeName,
            leaveTypeName,
            totalDays: leaveRequest.totalDays,
            formattedStartDate,
            formattedEndDate,
            requestUrl,
          });
        }
      }
    } catch (notificationError) {
      logger.error(`Error sending notifications after manager approval: ${notificationError.message}`, {
        stack: notificationError.stack,
        leaveRequestId: id,
      });
    }

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

    // Allow HR approve when status is MANAGER_APPROVED (two-tier) or PENDING (override / single-tier)
    if (!["MANAGER_APPROVED", "PENDING"].includes(leaveRequest.status)) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: `Cannot approve leave request. Current status: ${leaveRequest.status}.`,
      });
    }

    const wasPending = leaveRequest.status === "PENDING";

    // Start transaction to update request and balance
    const updatedRequest = await prisma.$transaction(async (tx) => {
      // Update leave request status; set audit flag when HR approved from PENDING
      const updated = await tx.leaveRequest.update({
        where: { id },
        data: {
          status: "APPROVED",
          hrId: userId,
          hrApprovedAt: new Date(),
          ...(wasPending ? { hrApprovedWithoutManager: true } : {}),
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

      // Move days from pending to used on the pool this leave type targets.
      const approvalPool = leaveTypePool(leaveRequest.leaveType);
      if (approvalPool !== "none") {
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
          const updateData =
            approvalPool === "sick"
              ? {
                  usedSickDays: { increment: leaveRequest.totalDays },
                  pendingSickDays: { decrement: leaveRequest.totalDays },
                }
              : {
                  usedDays: { increment: leaveRequest.totalDays },
                  pendingDays: { decrement: leaveRequest.totalDays },
                };
          await tx.yearlyEntitlement.update({
            where: { id: entitlement.id },
            data: updateData,
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
      wasPending
        ? `HR ${userId} approved leave request ${id} (override/single-tier) for employee ${leaveRequest.user.employeeId}`
        : `HR ${userId} approved leave request ${id} for employee ${leaveRequest.user.employeeId}`
    );

    try {
      const employeeName = updatedRequest.user.name || updatedRequest.user.employeeId || "Employee";
      const leaveTypeName = updatedRequest.leaveType.name;
      const formattedStartDate = leaveRequest.startDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const formattedEndDate = leaveRequest.endDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      await createNotification(
        tenantId,
        leaveRequest.userId,
        "Leave Request Approved",
        `Your ${leaveTypeName} request for ${leaveRequest.totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate} has been approved.`,
        "LEAVE",
        null
      );

      if (updatedRequest.user.email) {
        await sendLeaveApprovedEmail({
          to: updatedRequest.user.email,
          employeeName,
          leaveTypeName,
          totalDays: leaveRequest.totalDays,
          formattedStartDate,
          formattedEndDate,
        });
      }
    } catch (notificationError) {
      logger.error(`Error sending notifications after HR approval: ${notificationError.message}`, {
        stack: notificationError.stack,
        leaveRequestId: id,
      });
    }

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
    // HR (or SUPER_ADMIN impersonating tenant) can reject any request
    const isManager = leaveRequest.managerId === userId;
    const isHR =
      ["HR_ADMIN", "HR_STAFF"].includes(role) ||
      (role === "SUPER_ADMIN" && req.effectiveTenantId);

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

      // Release pending days from the pool this leave type targets (they were booked at create).
      const rejectPool = leaveTypePool(leaveRequest.leaveType);
      if (
        ["PENDING", "MANAGER_APPROVED"].includes(leaveRequest.status) &&
        rejectPool !== "none"
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
          const updateData =
            rejectPool === "sick"
              ? { pendingSickDays: { decrement: leaveRequest.totalDays } }
              : { pendingDays: { decrement: leaveRequest.totalDays } };
          await tx.yearlyEntitlement.update({
            where: { id: entitlement.id },
            data: updateData,
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

    try {
      const employeeName = result.user.name || result.user.employeeId || "Employee";
      const leaveTypeName = result.leaveType.name;
      const formattedStartDate = leaveRequest.startDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      const formattedEndDate = leaveRequest.endDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

      await createNotification(
        tenantId,
        leaveRequest.userId,
        "Leave Request Rejected",
        `Your ${leaveTypeName} request for ${leaveRequest.totalDays.toFixed(1)} day(s) from ${formattedStartDate} to ${formattedEndDate} has been rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
        "LEAVE",
        null
      );

      if (result.user.email) {
        await sendLeaveRejectedEmail({
          to: result.user.email,
          employeeName,
          leaveTypeName,
          totalDays: leaveRequest.totalDays,
          formattedStartDate,
          formattedEndDate,
          rejectionReason: rejectionReason || null,
        });
      }
    } catch (notificationError) {
      logger.error(`Error sending notifications after rejection: ${notificationError.message}`, {
        stack: notificationError.stack,
        leaveRequestId: id,
      });
    }

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

      // Release pending days from the pool this leave type targets (cancellation).
      const cancelPool = leaveTypePool(leaveRequest.leaveType);
      if (
        ["PENDING", "MANAGER_APPROVED"].includes(leaveRequest.status) &&
        cancelPool !== "none"
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
          const updateData =
            cancelPool === "sick"
              ? { pendingSickDays: { decrement: leaveRequest.totalDays } }
              : { pendingDays: { decrement: leaveRequest.totalDays } };
          await tx.yearlyEntitlement.update({
            where: { id: entitlement.id },
            data: updateData,
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

      const yearStartDate = new Date(currentYear, 0, 1);
      const yearEndDate = new Date(currentYear, 11, 31);

      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { hireDate: true },
      });

      const alloc = computeInitialAllocation({
        user: userRecord,
        policy,
        year: currentYear,
      });

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
          allocatedDays: alloc.allocatedDays,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          allocatedSickDays: alloc.allocatedSickDays,
          usedSickDays: 0,
          pendingSickDays: 0,
          sickAdjustmentDays: 0,
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

    const balances = computeAvailableBalance(entitlement);

    res.status(200).json({
      success: true,
      message: "Leave balance fetched successfully",
      data: {
        ...entitlement,
        availableBalance: Math.max(0, balances.annual), // Annual pool (non-negative)
        availableSickBalance: Math.max(0, balances.sick),
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
        departmentId: true,
        hireDate: true,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Employee not found",
      });
    }

    const requesterRole = req.user?.role;
    if (
      requesterRole === "DEPARTMENT_ADMIN" &&
      (!req.user?.departmentId ||
        employee.departmentId !== req.user.departmentId)
    ) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "You can only view leave balance for employees in your department",
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

      const yearStartDate = new Date(currentYear, 0, 1);
      const yearEndDate = new Date(currentYear, 11, 31);

      const alloc = computeInitialAllocation({
        user: { hireDate: employee.hireDate },
        policy,
        year: currentYear,
      });

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
          allocatedDays: alloc.allocatedDays,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          allocatedSickDays: alloc.allocatedSickDays,
          usedSickDays: 0,
          pendingSickDays: 0,
          sickAdjustmentDays: 0,
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

    const balances = computeAvailableBalance(entitlement);

    // Audit log
    await addLog(
      hrUserId,
      tenantId,
      "VIEW",
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
        availableBalance: Math.max(0, balances.annual),
        availableSickBalance: Math.max(0, balances.sick),
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
        hireDate: true,
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

      const alloc = computeInitialAllocation({
        user: { hireDate: employee.hireDate },
        policy,
        year: currentYear,
      });

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
          allocatedDays: alloc.allocatedDays,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          allocatedSickDays: alloc.allocatedSickDays,
          usedSickDays: 0,
          pendingSickDays: 0,
          sickAdjustmentDays: 0,
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

    const balances = computeAvailableBalance(updatedEntitlement);

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
        availableBalance: Math.max(0, balances.annual),
        availableSickBalance: Math.max(0, balances.sick),
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
        status: { in: EMPLOYEE_STATUSES_ACTIVE_FOR_WORK },
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
          availableSickBalance: 0,
          allocatedDays: 0,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          allocatedSickDays: 0,
          usedSickDays: 0,
          pendingSickDays: 0,
          sickAdjustmentDays: 0,
          encashedDays: 0,
          encashmentAmount: 0,
        };
      }

      const poolBalances = computeAvailableBalance(entitlement);

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
        availableBalance: Math.max(0, poolBalances.annual),
        availableSickBalance: Math.max(0, poolBalances.sick),
        allocatedDays: entitlement.allocatedDays,
        accruedDays: entitlement.accruedDays,
        carriedOverDays: entitlement.carriedOverDays,
        adjustmentDays: entitlement.adjustmentDays,
        usedDays: entitlement.usedDays,
        pendingDays: entitlement.pendingDays,
        allocatedSickDays: entitlement.allocatedSickDays ?? 0,
        usedSickDays: entitlement.usedSickDays ?? 0,
        pendingSickDays: entitlement.pendingSickDays ?? 0,
        sickAdjustmentDays: entitlement.sickAdjustmentDays ?? 0,
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
      "VIEW",
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
        hireDate: true,
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

    const yearStartDate = new Date(targetYear, 0, 1);
    const yearEndDate = new Date(targetYear, 11, 31);

    const alloc = computeInitialAllocation({
      user: { hireDate: employee.hireDate },
      policy,
      year: targetYear,
    });

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
        allocatedDays: alloc.allocatedDays,
        accruedDays: 0,
        carriedOverDays: 0,
        adjustmentDays: 0,
        usedDays: 0,
        pendingDays: 0,
        allocatedSickDays: alloc.allocatedSickDays,
        usedSickDays: 0,
        pendingSickDays: 0,
        sickAdjustmentDays: 0,
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

    const balances = computeAvailableBalance(entitlement);

    await addLog(
      hrUserId,
      tenantId,
      "CREATE",
      "YearlyEntitlement",
      entitlement.id,
      {
        userId,
        year: targetYear,
        allocatedDays: alloc.allocatedDays,
        allocatedSickDays: alloc.allocatedSickDays,
        eligibleForAnnual: alloc.eligible,
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
        availableBalance: Math.max(0, balances.annual),
        availableSickBalance: Math.max(0, balances.sick),
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

      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { hireDate: true },
      });

      const alloc = computeInitialAllocation({
        user: userRecord,
        policy,
        year: currentYear,
      });

      entitlement = await prisma.yearlyEntitlement.create({
        data: {
          tenantId,
          userId,
          policyId: policy.id,
          year: currentYear,
          allocatedDays: alloc.allocatedDays,
          accruedDays: 0,
          carriedOverDays: 0,
          adjustmentDays: 0,
          usedDays: 0,
          pendingDays: 0,
          allocatedSickDays: alloc.allocatedSickDays,
          usedSickDays: 0,
          pendingSickDays: 0,
          sickAdjustmentDays: 0,
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
    const totalSickDays =
      (entitlement.allocatedSickDays ?? 0) + (entitlement.sickAdjustmentDays ?? 0);
    const sickDaysTaken = entitlement.usedSickDays ?? 0;

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
    const sickLeaveAllocationEnabled = policy?.sickLeaveAllocationEnabled ?? false;
    const allocatedSickDaysPerYear = policy?.allocatedSickDaysPerYear ?? 0;

    return res.status(200).json({
      success: true,
      message: "Leave stats fetched successfully",
      data: {
        totalDays,
        daysTaken,
        totalSickDays,
        sickDaysTaken,
        pendingCount,
        approvedCount,
        defaultDaysPerYear,
        accrualMethod,
        carryoverType,
        sickLeaveAllocationEnabled,
        allocatedSickDaysPerYear,
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