import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

/**
 * Get all holidays for a tenant
 */
export const getAllHolidays = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { year, type, isActive } = req.query;

        const where = { tenantId };

        if (year) {
            where.OR = [
                { year: parseInt(year) },
                { isRecurring: true, year: null },
            ];
        }

        if (type) {
            where.type = type;
        }

        if (isActive !== undefined) {
            where.isActive = isActive === "true";
        }

        const holidays = await prisma.holiday.findMany({
            where,
            orderBy: [
                { date: "asc" },
            ],
        });

        logger.info(`Retrieved ${holidays.length} holidays for tenant ${tenantId}`);

        return res.status(200).json({
            success: true,
            data: holidays,
            count: holidays.length,
        });
    } catch (error) {
        logger.error(`Error fetching holidays: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch holidays",
        });
    }
};

/**
 * Get a single holiday by ID
 */
export const getHolidayById = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const holiday = await prisma.holiday.findFirst({
            where: {
                id,
                tenantId,
            },
        });

        if (!holiday) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Holiday not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: holiday,
        });
    } catch (error) {
        logger.error(`Error fetching holiday: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch holiday",
        });
    }
};

/**
 * Create a new holiday
 */
export const createHoliday = async (req, res) => {
    try {
        const { id: userId, tenantId } = req.user;
        const { name, date, type, description, isRecurring, year, isActive } = req.body;

        if (!name || !date) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Name and date are required",
            });
        }

        // Parse date
        const holidayDate = new Date(date);
        if (isNaN(holidayDate.getTime())) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Invalid date format",
            });
        }

        // Check for duplicate
        const existing = await prisma.holiday.findFirst({
            where: {
                tenantId,
                date: holidayDate,
                name,
            },
        });

        if (existing) {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "A holiday with this name and date already exists",
            });
        }

        const holiday = await prisma.holiday.create({
            data: {
                tenantId,
                name,
                date: holidayDate,
                type: type || "PUBLIC",
                description,
                isRecurring: isRecurring || false,
                year: isRecurring ? null : year || holidayDate.getFullYear(),
                isActive: isActive !== undefined ? isActive : true,
            },
        });

        logger.info(`Created holiday: ${holiday.id} - ${holiday.name}`);

        const changes = {
            name: { before: null, after: holiday.name },
            date: { before: null, after: holiday.date },
            type: { before: null, after: holiday.type },
            isRecurring: { before: null, after: holiday.isRecurring },
        };
        await addLog(userId, tenantId, "CREATE", "Holiday", holiday.id, changes, req);

        return res.status(201).json({
            success: true,
            data: holiday,
            message: "Holiday created successfully",
        });
    } catch (error) {
        logger.error(`Error creating holiday: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create holiday",
        });
    }
};

/**
 * Update an existing holiday
 */
export const updateHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;
        const { name, date, type, description, isRecurring, year, isActive } = req.body;

        const existingHoliday = await prisma.holiday.findFirst({
            where: {
                id,
                tenantId,
            },
        });

        if (!existingHoliday) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Holiday not found",
            });
        }

        const updateData = {};

        if (name !== undefined) updateData.name = name;
        if (date !== undefined) {
            const holidayDate = new Date(date);
            if (isNaN(holidayDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Invalid date format",
                });
            }
            updateData.date = holidayDate;
        }
        if (type !== undefined) updateData.type = type;
        if (description !== undefined) updateData.description = description;
        if (isRecurring !== undefined) {
            updateData.isRecurring = isRecurring;
            if (isRecurring) {
                updateData.year = null;
            }
        }
        if (year !== undefined && !updateData.isRecurring) updateData.year = year;
        if (isActive !== undefined) updateData.isActive = isActive;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        const updatedHoliday = await prisma.holiday.update({
            where: { id },
            data: updateData,
        });

        logger.info(`Updated holiday: ${id}`);

        const changes = getChangesDiff(existingHoliday, updatedHoliday);
        await addLog(userId, tenantId, "UPDATE", "Holiday", id, changes, req);

        return res.status(200).json({
            success: true,
            data: updatedHoliday,
            message: "Holiday updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating holiday: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update holiday",
        });
    }
};

/**
 * Delete a holiday
 */
export const deleteHoliday = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const holiday = await prisma.holiday.findFirst({
            where: {
                id,
                tenantId,
            },
        });

        if (!holiday) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Holiday not found",
            });
        }

        await prisma.holiday.delete({
            where: { id },
        });

        logger.info(`Deleted holiday: ${id}`);

        const changes = {
            name: { before: holiday.name, after: null },
            date: { before: holiday.date, after: null },
        };
        await addLog(userId, tenantId, "DELETE", "Holiday", id, changes, req);

        return res.status(200).json({
            success: true,
            message: "Holiday deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting holiday: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete holiday",
        });
    }
};

/**
 * Bulk create holidays (useful for importing)
 */
export const bulkCreateHolidays = async (req, res) => {
    try {
        const { id: userId, tenantId } = req.user;
        const { holidays } = req.body;

        if (!Array.isArray(holidays) || holidays.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "holidays array is required and must not be empty",
            });
        }

        const validHolidays = [];
        const errors = [];

        for (let i = 0; i < holidays.length; i++) {
            const h = holidays[i];

            if (!h.name || !h.date) {
                errors.push({ index: i, error: "name and date are required" });
                continue;
            }

            const holidayDate = new Date(h.date);
            if (isNaN(holidayDate.getTime())) {
                errors.push({ index: i, error: "Invalid date format" });
                continue;
            }

            validHolidays.push({
                tenantId,
                name: h.name,
                date: holidayDate,
                type: h.type || "PUBLIC",
                description: h.description || null,
                isRecurring: h.isRecurring || false,
                year: h.isRecurring ? null : h.year || holidayDate.getFullYear(),
                isActive: h.isActive !== undefined ? h.isActive : true,
            });
        }

        if (validHolidays.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid holidays to create",
                errors,
            });
        }

        // Use createMany with skipDuplicates
        const result = await prisma.holiday.createMany({
            data: validHolidays,
            skipDuplicates: true,
        });

        logger.info(`Bulk created ${result.count} holidays for tenant ${tenantId}`);

        await addLog(userId, tenantId, "CREATE", "Holiday", "bulk", {
            count: { before: 0, after: result.count },
        }, req);

        return res.status(201).json({
            success: true,
            data: {
                created: result.count,
                skipped: validHolidays.length - result.count,
                errors,
            },
            message: `Created ${result.count} holidays`,
        });
    } catch (error) {
        logger.error(`Error bulk creating holidays: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create holidays",
        });
    }
};

/**
 * Get holidays for a specific date range (useful for calendars)
 */
export const getHolidaysInRange = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "startDate and endDate are required",
            });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Invalid date format",
            });
        }

        const year = start.getFullYear();

        const holidays = await prisma.holiday.findMany({
            where: {
                tenantId,
                isActive: true,
                OR: [
                    // Specific date range
                    {
                        date: {
                            gte: start,
                            lte: end,
                        },
                    },
                    // Recurring holidays
                    {
                        isRecurring: true,
                        year: null,
                    },
                ],
            },
            orderBy: { date: "asc" },
        });

        // Process recurring holidays to show in current year context
        const processedHolidays = holidays.map((h) => {
            if (h.isRecurring && !h.year) {
                const recurringDate = new Date(h.date);
                return {
                    ...h,
                    displayDate: new Date(year, recurringDate.getMonth(), recurringDate.getDate()),
                };
            }
            return { ...h, displayDate: h.date };
        }).filter((h) => h.displayDate >= start && h.displayDate <= end);

        return res.status(200).json({
            success: true,
            data: processedHolidays,
            count: processedHolidays.length,
        });
    } catch (error) {
        logger.error(`Error fetching holidays in range: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch holidays",
        });
    }
};

/**
 * Get holiday types enum values
 */
export const getHolidayTypes = async (req, res) => {
    try {
        const types = {
            PUBLIC: "National/public holiday",
            COMPANY: "Company-specific holiday",
            REGIONAL: "Regional holiday (state/province)",
            RELIGIOUS: "Religious holiday",
            OPTIONAL: "Optional holiday (employee choice)",
        };

        return res.status(200).json({
            success: true,
            data: types,
        });
    } catch (error) {
        logger.error(`Error fetching holiday types: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch holiday types",
        });
    }
};

