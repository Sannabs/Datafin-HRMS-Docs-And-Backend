import {
    validateTransition as validatePayrollRunTransition,
    isTerminalState,
    getAvailableTransitions,
    getStateMeta,
    canRetry,
    getCompletionPercentage,
} from "../state-machines/payroll-run.machine.js";

/**
 * Determines if a status transition is valid using XState state machine.
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"FAILED"} currentStatus
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"FAILED"} nextStatus
 * @param {Object} context - Additional context for guards (totalEmployees, processedEmployees, failedEmployees)
 * @returns {{ valid: boolean, message?: string, event?: string }}
 */
export const validateStatusTransition = (currentStatus, nextStatus, context = {}) => {
    return validatePayrollRunTransition(currentStatus, nextStatus, context);
};

/**
 * Indicates whether a payroll run can no longer be modified.
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"FAILED"} status
 * @returns {boolean}
 */
export const isTerminalStatus = (status) => isTerminalState(status);

/**
 * Get available transitions for a payroll run status
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"FAILED"} status
 * @returns {Array<string>} Available event names
 */
export { getAvailableTransitions };

/**
 * Get metadata for a payroll run status
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"FAILED"} status
 * @returns {Object|null} State metadata with description and allowedActions
 */
export { getStateMeta };

/**
 * Check if a failed payroll run can be retried
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"FAILED"} status
 * @returns {boolean}
 */
export { canRetry };

/**
 * Get completion percentage for a payroll run
 * @param {Object} context - Payroll run context with totalEmployees, processedEmployees, failedEmployees
 * @returns {number} Percentage (0-100)
 */
export { getCompletionPercentage };

