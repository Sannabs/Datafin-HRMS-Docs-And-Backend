const STATUS_FLOW = ["DRAFT", "PROCESSING", "COMPLETED", "CLOSED"];

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
 * Determines if a status transition is valid based on the defined flow.
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} currentStatus
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} nextStatus
 * @returns {{ valid: boolean, message?: string }}
 */
export const validateStatusTransition = (currentStatus, nextStatus) => {
    if (currentStatus === nextStatus) {
        return { valid: false, message: "Pay period is already in the requested status" };
    }

    const currentIndex = STATUS_FLOW.indexOf(currentStatus);
    const nextIndex = STATUS_FLOW.indexOf(nextStatus);

    if (currentIndex === -1 || nextIndex === -1) {
        return { valid: false, message: "Invalid pay period status provided" };
    }

    if (nextIndex !== currentIndex + 1) {
        return { valid: false, message: `Invalid transition from ${currentStatus} to ${nextStatus}` };
    }

    return { valid: true };
};

/**
 * Indicates whether a pay period can no longer be modified.
 * @param {"DRAFT"|"PROCESSING"|"COMPLETED"|"CLOSED"} status
 * @returns {boolean}
 */
export const isTerminalStatus = (status) => status === "CLOSED";

