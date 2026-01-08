import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

// ============================================
// LEAVE POLICY CONTROLLERS
// ============================================

export const getLeavePolicy = async (req, res) => {
    // TODO
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