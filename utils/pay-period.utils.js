import {
    validateTransition as validatePayPeriodTransition,
    isTerminalState,
    getAvailableTransitions,
    getStateMeta,
    getNextStatus,
} from "../state-machines/pay-period.machine.js";

/**
 * Calculates calendar metadata based on a reference date.
 * @param {Date | string} referenceDate - Start date of the pay period.
 * @returns {{ calendarMonth: number, calendarYear: number }}
 */
export const getCalendarMetadata = (referenceDate) => {
    const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);

    if (Number.isNaN(date.getTime())) {
        throw new Error("Invalid date provided for calendar metadata calculation");
    }

    return {
        calendarMonth: date.getUTCMonth() + 1,
        calendarYear: date.getUTCFullYear(),
    };
};

/**
 * Derives a period name from start and end dates in the same format as schedule-generated periods.
 * e.g. "Mar 2026 (1–14)"
 * @param {Date | string} startDate
 * @param {Date | string} endDate
 * @returns {string}
 */
export const formatPeriodNameFromDates = (startDate, endDate) => {
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("Invalid date provided for period name");
    }
    const monthYear = start.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    return `${monthYear} (${start.getUTCDate()}–${end.getUTCDate()})`;
};

/**
 * Checks whether two date ranges overlap (inclusive).
 * @param {Date | string} startA
 * @param {Date | string} endA
 * @param {Date | string} startB
 * @param {Date | string} endB
 * @returns {boolean}
 */
export const hasDateOverlap = (startA, endA, startB, endB) => {
    const rangeAStart = startA instanceof Date ? startA : new Date(startA);
    const rangeAEnd = endA instanceof Date ? endA : new Date(endA);
    const rangeBStart = startB instanceof Date ? startB : new Date(startB);
    const rangeBEnd = endB instanceof Date ? endB : new Date(endB);

    if (
        Number.isNaN(rangeAStart.getTime()) ||
        Number.isNaN(rangeAEnd.getTime()) ||
        Number.isNaN(rangeBStart.getTime()) ||
        Number.isNaN(rangeBEnd.getTime())
    ) {
        throw new Error("Invalid date provided for overlap comparison");
    }

    return rangeAStart <= rangeBEnd && rangeBStart <= rangeAEnd;
};

/**
 * Determines if a status transition is valid using XState state machine.
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} currentStatus
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} nextStatus
 * @param {Object} context - Additional context for guards (hasIncompleteRuns, hasFailedRuns)
 * @returns {{ valid: boolean, message?: string, event?: string }}
 */
export const validateStatusTransition = (currentStatus, nextStatus, context = {}) => {
    return validatePayPeriodTransition(currentStatus, nextStatus, context);
};

/**
 * Indicates whether a pay period can no longer be modified.
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} status
 * @returns {boolean}
 */
export const isTerminalStatus = (status) => isTerminalState(status);

/**
 * Get available transitions for a pay period status
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} status
 * @returns {Array<string>} Available event names
 */
export { getAvailableTransitions };

/**
 * Get metadata for a pay period status
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} status
 * @returns {Object|null} State metadata with description and allowedActions
 */
export { getStateMeta };

/**
 * Get the next valid status in the flow
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} currentStatus
 * @returns {string|null} Next status or null if terminal
 */
export { getNextStatus };

