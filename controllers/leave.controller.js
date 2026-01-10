import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";
import { treeifyError } from "better-auth";

// ============================================
// LEAVE POLICY CONTROLLERS
// ============================================

export const getLeavePolicy = async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    if (!tenantId)
      return res
        .status(400)
        .json({
          success: false,
          error: "Tenant ID is required",
          message: "Tenant ID is required",
        });


     const policy = await prisma.annualLeavePolicy.findFirst({
        where: {
            tenantId
        }
     })



     if(!policy) return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Leave policy not found",
     })




     res.status(200).json({
        success: true,
        message: "Fetched company leave policy successfully",
        data: policy
     })
  } catch (error) {
    logger.error(`Error getting leave policy: ${error.message}`, {
      error: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to get leave policy",
    });
  }
};

export const updateLeavePolicy = async (req, res) => {
  // TODO
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
