import prisma from "../config/prisma.config.js";
import logger from "./logger.js";

// Default weekend days (0 = Sunday, 6 = Saturday)
const DEFAULT_WEEKEND_DAYS = [0, 6];

/**
 * Check if a date is a weekend based on tenant configuration
 * @param {Date} date - Date to check
 * @param {number[]} weekendDays - Array of weekend day numbers (0=Sun, 6=Sat)
 * @returns {boolean} True if the date is a weekend
 */
export const isWeekend = (date, weekendDays = DEFAULT_WEEKEND_DAYS) => {
    const dayOfWeek = date.getDay();
    return weekendDays.includes(dayOfWeek);
};

/**
 * Format date to YYYY-MM-DD string for comparison
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
const formatDate = (date) => {
    return date.toISOString().split("T")[0];
};

/**
 * Get holidays for a tenant within a date range
 * @param {string} tenantId - Tenant ID
 * @param {Date} startDate - Start of date range
 * @param {Date} endDate - End of date range
 * @returns {Promise<Set<string>>} Set of holiday dates in YYYY-MM-DD format
 */
export const getHolidaysInRange = async (tenantId, startDate, endDate) => {
    try {
        const year = startDate.getFullYear();

        const holidays = await prisma.holiday.findMany({
            where: {
                tenantId,
                isActive: true,
                OR: [
                    // Specific year holidays
                    {
                        date: {
                            gte: startDate,
                            lte: endDate,
                        },
                    },
                    // Recurring holidays (check by month/day)
                    {
                        isRecurring: true,
                        year: null,
                    },
                ],
            },
            select: {
                date: true,
                isRecurring: true,
            },
        });

        const holidayDates = new Set();

        for (const holiday of holidays) {
            if (holiday.isRecurring && !holiday.year) {
                // For recurring holidays, create date for current year
                const recurringDate = new Date(holiday.date);
                const thisYearDate = new Date(
                    year,
                    recurringDate.getMonth(),
                    recurringDate.getDate()
                );
                if (thisYearDate >= startDate && thisYearDate <= endDate) {
                    holidayDates.add(formatDate(thisYearDate));
                }
            } else {
                holidayDates.add(formatDate(new Date(holiday.date)));
            }
        }

        return holidayDates;
    } catch (error) {
        logger.error(`Error fetching holidays: ${error.message}`, {
            tenantId,
            error: error.stack,
        });
        return new Set();
    }
};

/**
 * Get tenant's weekend configuration
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number[]>} Array of weekend day numbers
 */
export const getTenantWeekendDays = async (tenantId) => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { weekendDays: true },
        });

        return tenant?.weekendDays || DEFAULT_WEEKEND_DAYS;
    } catch (error) {
        logger.error(`Error fetching tenant weekend config: ${error.message}`, {
            tenantId,
            error: error.stack,
        });
        return DEFAULT_WEEKEND_DAYS;
    }
};

/**
 * Calculate working days in a month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {string} tenantId - Tenant ID for holiday/weekend lookup
 * @returns {Promise<number>} Number of working days
 */
export const getWorkingDaysInMonth = async (year, month, tenantId) => {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); // Last day of month

    return calculateWorkingDays(startDate, endDate, tenantId);
};

/**
 * Calculate working days between two dates
 * @param {Date} startDate - Start date (inclusive)
 * @param {Date} endDate - End date (inclusive)
 * @param {string} tenantId - Tenant ID for holiday/weekend lookup
 * @returns {Promise<number>} Number of working days
 */
export const calculateWorkingDays = async (startDate, endDate, tenantId) => {
    try {
        // Get tenant weekend configuration
        const weekendDays = await getTenantWeekendDays(tenantId);

        // Get holidays in range
        const holidays = await getHolidaysInRange(tenantId, startDate, endDate);

        let workingDays = 0;
        const currentDate = new Date(startDate);

        while (currentDate <= endDate) {
            const dateStr = formatDate(currentDate);

            // Check if it's not a weekend and not a holiday
            if (!isWeekend(currentDate, weekendDays) && !holidays.has(dateStr)) {
                workingDays++;
            }

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return workingDays;
    } catch (error) {
        logger.error(`Error calculating working days: ${error.message}`, {
            startDate,
            endDate,
            tenantId,
            error: error.stack,
        });

        // Fallback to simple estimation
        const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
        return Math.round(totalDays * 5 / 7);
    }
};

/**
 * Calculate working days in current month (synchronous fallback)
 * Used when tenant context is not available
 * @param {number[]} weekendDays - Weekend day numbers
 * @returns {number} Estimated working days
 */
export const getWorkingDaysInCurrentMonth = (weekendDays = DEFAULT_WEEKEND_DAYS) => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    let workingDays = 0;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        if (!isWeekend(currentDate, weekendDays)) {
            workingDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDays;
};

/**
 * Check if a specific date is a working day
 * @param {Date} date - Date to check
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<boolean>} True if it's a working day
 */
export const isWorkingDay = async (date, tenantId) => {
    const weekendDays = await getTenantWeekendDays(tenantId);

    if (isWeekend(date, weekendDays)) {
        return false;
    }

    const holidays = await getHolidaysInRange(tenantId, date, date);
    return holidays.size === 0;
};

/**
 * Get next working day from a given date
 * @param {Date} date - Starting date
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Date>} Next working day
 */
export const getNextWorkingDay = async (date, tenantId) => {
    const weekendDays = await getTenantWeekendDays(tenantId);
    const currentDate = new Date(date);

    // Look ahead up to 14 days to find next working day
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 14);

    const holidays = await getHolidaysInRange(tenantId, date, endDate);

    while (currentDate <= endDate) {
        currentDate.setDate(currentDate.getDate() + 1);
        const dateStr = formatDate(currentDate);

        if (!isWeekend(currentDate, weekendDays) && !holidays.has(dateStr)) {
            return currentDate;
        }
    }

    // Fallback: return next weekday (without holiday check)
    while (isWeekend(currentDate, weekendDays)) {
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return currentDate;
};

