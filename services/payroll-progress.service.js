import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

/**
 * Create progress record for payroll run
 * @param {string} payrollRunId - Payroll run ID
 * @param {number} totalEmployees - Total number of employees to process
 * @returns {Promise<Object>} Created progress record
 */
export const createProgress = async (payrollRunId, totalEmployees) => {
    try {
        const progress = await prisma.payrollProgress.create({
            data: {
                payrollRunId,
                totalEmployees,
                completedEmployees: 0,
                failedEmployees: 0,
                startedAt: new Date(),
            },
        });

        logger.info(`Created progress tracking for payroll run ${payrollRunId}`, {
            totalEmployees,
        });

        return progress;
    } catch (error) {
        logger.error(`Error creating progress record: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        throw error;
    }
};

/**
 * Update progress for payroll run
 * @param {string} payrollRunId - Payroll run ID
 * @param {Object} updates - Progress updates
 * @param {number} updates.completedEmployees - Number of completed employees
 * @param {number} updates.failedEmployees - Number of failed employees
 * @returns {Promise<Object>} Updated progress record
 */
export const updateProgress = async (payrollRunId, updates) => {
    try {
        const { completedEmployees, failedEmployees } = updates;

        // Calculate estimated completion
        const estimatedCompletion = await calculateEstimatedCompletion(payrollRunId);

        const progress = await prisma.payrollProgress.update({
            where: { payrollRunId },
            data: {
                ...(completedEmployees !== undefined && { completedEmployees }),
                ...(failedEmployees !== undefined && { failedEmployees }),
                lastUpdatedAt: new Date(),
                ...(estimatedCompletion && { estimatedCompletionAt: estimatedCompletion }),
            },
        });

        return progress;
    } catch (error) {
        logger.error(`Error updating progress: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        throw error;
    }
};

/**
 * Get progress for payroll run
 * @param {string} payrollRunId - Payroll run ID
 * @returns {Promise<Object|null>} Progress record or null
 */
export const getProgress = async (payrollRunId) => {
    try {
        const progress = await prisma.payrollProgress.findUnique({
            where: { payrollRunId },
        });

        return progress;
    } catch (error) {
        logger.error(`Error getting progress: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        throw error;
    }
};

/**
 * Calculate estimated completion time based on current processing rate
 * @param {string} payrollRunId - Payroll run ID
 * @returns {Promise<Date|null>} Estimated completion date or null
 */
export const calculateEstimatedCompletion = async (payrollRunId) => {
    try {
        const progress = await prisma.payrollProgress.findUnique({
            where: { payrollRunId },
        });

        if (!progress || progress.completedEmployees === 0) {
            return null;
        }

        const totalProcessed = progress.completedEmployees + progress.failedEmployees;
        const remaining = progress.totalEmployees - totalProcessed;

        if (remaining <= 0) {
            return new Date();
        }

        // Calculate average time per employee
        const elapsed = Date.now() - progress.startedAt.getTime();
        const avgTimePerEmployee = elapsed / totalProcessed;

        // Estimate completion time
        const estimatedMs = avgTimePerEmployee * remaining;
        const estimatedCompletion = new Date(Date.now() + estimatedMs);

        return estimatedCompletion;
    } catch (error) {
        logger.error(`Error calculating estimated completion: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });
        return null;
    }
};

