// patrol.controller.js
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import { getCurrentSlotBoundaries } from "../utils/patrol.util.js";


// ---------------------------------------------------------
// POST /patrol/scan
// Guard-facing — scan a QR checkpoint
// ---------------------------------------------------------
export const scanCheckpoint = async (req, res) => {
    try {
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { token } = req.body;

        if (!userId || !tenantId) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        if (!token || typeof token !== "string" || !token.trim()) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Token is required",
            });
        }

        // 1. Resolve token → checkpoint
        const checkpoint = await prisma.patrolCheckpoint.findUnique({
            where: { token: token.trim() },
            include: { patrolSite: true },
        });

        if (!checkpoint || !checkpoint.isActive) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Invalid or inactive checkpoint",
            });
        }

        // 2. Find active schedule for this user + site
        const schedule = await prisma.patrolSchedule.findFirst({
            where: {
                tenantId,
                patrolSiteId: checkpoint.patrolSiteId,
                assignedUserId: userId,
                isActive: true,
                deletedAt: null,
            },
            include: {
                patrolSite: {
                    include: {
                        checkpoints: { where: { isActive: true } },
                    },
                },
            },
        });

        if (!schedule) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "No active patrol schedule found for this checkpoint",
            });
        }

        const now = new Date();

        // 3. Find the current open session
        let session = await prisma.patrolSession.findFirst({
            where: {
                patrolScheduleId: schedule.id,
                assignedUserId: userId,
                slotStart: { lte: now },
                slotEnd: { gte: now },
                status: "IN_PROGRESS",
            },
        });

        // 4. If no session exists yet, create it (guard scanned before cron ran)
        if (!session) {
            const slotBoundaries = getCurrentSlotBoundaries(
                now,
                schedule.windowStartTime,
                schedule.windowEndTime,
                schedule.intervalHours
            );

            if (!slotBoundaries) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Scan is outside the scheduled patrol window",
                });
            }

            const totalCheckpoints = schedule.patrolSite.checkpoints.length;

            session = await prisma.patrolSession.create({
                data: {
                    patrolScheduleId: schedule.id,
                    assignedUserId: userId,
                    slotStart: slotBoundaries.start,
                    slotEnd: slotBoundaries.end,
                    status: "IN_PROGRESS",
                    checkpointsTotal: totalCheckpoints,
                    startedAt: now,
                },
            });
        }

        // 5. Idempotency — already scanned this checkpoint in this session?
        const alreadyScanned = await prisma.patrolScanEvent.findUnique({
            where: {
                patrolSessionId_checkpointId: {
                    patrolSessionId: session.id,
                    checkpointId: checkpoint.id,
                },
            },
        });

        if (alreadyScanned) {
            return res.status(200).json({
                success: true,
                data: {
                    alreadyScanned: true,
                    session,
                    checkpoint: {
                        id: checkpoint.id,
                        name: checkpoint.name,
                        site: checkpoint.patrolSite.name,
                    },
                },
                message: "Checkpoint already scanned in this session",
            });
        }

        // 6. Determine required count
        const requiredCount = schedule.requireAllPoints
            ? session.checkpointsTotal
            : (schedule.minCheckpoints ?? session.checkpointsTotal);

        // 7. Log scan event + update session in a transaction
        const updatedSession = await prisma.$transaction(async (tx) => {
            await tx.patrolScanEvent.create({
                data: {
                    patrolSessionId: session.id,
                    checkpointId: checkpoint.id,
                    scannedByUserId: userId,
                    scannedAt: now,
                    deviceInfo: req.headers["user-agent"] ?? null,
                    ipAddress: req.ip ?? null,
                },
            });

            const newHitCount = session.checkpointsHit + 1;
            const isComplete = newHitCount >= requiredCount;

            return tx.patrolSession.update({
                where: { id: session.id },
                data: {
                    checkpointsHit: newHitCount,
                    startedAt: session.startedAt ?? now,
                    ...(isComplete && {
                        status: "COMPLETED",
                        completedAt: now,
                    }),
                },
            });
        });

        logger.info(
            `Patrol scan by user ${userId} — checkpoint: ${checkpoint.name}, session: ${session.id}, hit ${updatedSession.checkpointsHit}/${updatedSession.checkpointsTotal}`
        );

        await addLog(userId, tenantId, "OTHER", "PatrolScanEvent", session.id, {
            checkpoint: checkpoint.name,
            site: checkpoint.patrolSite.name,
            status: updatedSession.status,
        }, req);

        return res.status(200).json({
            success: true,
            data: {
                alreadyScanned: false,
                session: updatedSession,
                checkpoint: {
                    id: checkpoint.id,
                    name: checkpoint.name,
                    site: checkpoint.patrolSite.name,
                },
            },
            message:
                updatedSession.status === "COMPLETED"
                    ? "Round complete! All checkpoints scanned."
                    : `Checkpoint scanned. ${updatedSession.checkpointsHit}/${updatedSession.checkpointsTotal} complete.`,
        });
    } catch (error) {
        logger.error(`Error scanning patrol checkpoint: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to scan checkpoint",
        });
    }
};

// ---------------------------------------------------------
// POST /patrol/sites
// ---------------------------------------------------------
export const createSite = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { name, description } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Site name is required",
            });
        }

        const site = await prisma.patrolSite.create({
            data: { tenantId, name: name.trim(), description: description ?? null },
        });

        logger.info(`Created patrol site ${site.id} for tenant ${tenantId}`);
        await addLog(actorId, tenantId, "CREATE", "PatrolSite", site.id, { name: site.name }, req);

        return res.status(201).json({
            success: true,
            data: site,
            message: "Patrol site created successfully",
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "A patrol site with this name already exists",
            });
        }

        logger.error(`Error creating patrol site: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create patrol site",
        });
    }
};

// ---------------------------------------------------------
// GET /patrol/sites
// ---------------------------------------------------------
export const getSites = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const page = parseInt(req.query.page || 1);
        const limit = parseInt(req.query.limit || 10);
        const skip = (page - 1) * limit;

        const where = {tenantId, deletedAt: null}

        const [sites, total] = await Promise.all([
            prisma.patrolSite.findMany({
            where,
            include: {
                _count: { select: { checkpoints: true, schedules: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.patrolSite.count({ where }),
    ]);

        const totalPages = Math.ceil(total / limit);

        logger.info(`Retrieved ${sites.length} patrol sites for tenant ${tenantId}`);

        return res.status(200).json({
            success: true,
            data: sites,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        });
    } catch (error) {
        logger.error(`Error fetching patrol sites: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch patrol sites",
        });
    }
};


// ---------------------------------------------------------
// PATCH /patrol/sites/:siteId
// ---------------------------------------------------------
export const updateSite = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { siteId } = req.params;

        const existing = await prisma.patrolSite.findFirst({
            where: { id: siteId, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Patrol site not found",
            });
        }

        const allowedFields = ["name", "description", "isActive"];
        const filteredData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                filteredData[field] = req.body[field];
            }
        }

        if (Object.keys(filteredData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        const updated = await prisma.patrolSite.update({
            where: { id: siteId },
            data: filteredData,
        });

        logger.info(`Updated patrol site ${siteId}`);
        await addLog(actorId, tenantId, "UPDATE", "PatrolSite", siteId, filteredData, req);

        return res.status(200).json({
            success: true,
            data: updated,
            message: "Patrol site updated successfully",
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "A patrol site with this name already exists",
            });
        }

        logger.error(`Error updating patrol site: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update patrol site",
        });
    }
};

// ---------------------------------------------------------
// DELETE /patrol/sites/:siteId
// ---------------------------------------------------------
export const deleteSite = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { siteId } = req.params;

        const existing = await prisma.patrolSite.findFirst({
            where: { id: siteId, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Patrol site not found",
            });
        }

        await prisma.patrolSite.update({
            where: { id: siteId },
            data: { deletedAt: new Date(), isActive: false },
        });

        logger.info(`Soft deleted patrol site ${siteId}`);
        await addLog(actorId, tenantId, "DELETE", "PatrolSite", siteId, {}, req);

        return res.status(200).json({
            success: true,
            message: "Patrol site deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting patrol site: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete patrol site",
        });
    }
};

// ---------------------------------------------------------
// POST /patrol/sites/:siteId/checkpoints
// ---------------------------------------------------------
export const createCheckpoint = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { siteId } = req.params;
        const { name, description } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Checkpoint name is required",
            });
        }

        const site = await prisma.patrolSite.findFirst({
            where: { id: siteId, tenantId, deletedAt: null },
        });

        if (!site) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Patrol site not found",
            });
        }

        // token is auto-generated by @default(uuid()) in schema — static, never changes
        const checkpoint = await prisma.patrolCheckpoint.create({
            data: {
                patrolSiteId: siteId,
                name: name.trim(),
                description: description ?? null,
            },
        });

        logger.info(`Created checkpoint ${checkpoint.id} (${checkpoint.name}) for site ${siteId}`);
        await addLog(actorId, tenantId, "CREATE", "PatrolCheckpoint", checkpoint.id, { name: checkpoint.name, siteId }, req);

        return res.status(201).json({
            success: true,
            data: checkpoint,
            message: "Checkpoint created successfully",
        });
    } catch (error) {
        logger.error(`Error creating checkpoint: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create checkpoint",
        });
    }
};

// ---------------------------------------------------------
// GET /patrol/sites/:siteId/checkpoints
// ---------------------------------------------------------
export const getCheckpoints = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { siteId } = req.params;
        const page = parseInt(req.query.page || 1);
        const limit = parseInt(req.query.limit || 10);
        const skip = (page - 1) * limit;

        // PatrolCheckpoint has no deletedAt — soft-delete is isActive: false
        const where = {
            patrolSiteId: siteId,
            patrolSite: { tenantId, deletedAt: null },
        };

        const [checkpoints, total] = await Promise.all([
            prisma.patrolCheckpoint.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.patrolCheckpoint.count({ where }),
    ]);

        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            data: checkpoints,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        });
    } catch (error) {
        logger.error(`Error fetching checkpoints: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch checkpoints",
        });
    }
};

// ---------------------------------------------------------
// PATCH /patrol/checkpoints/:checkpointId
// ---------------------------------------------------------
export const updateCheckpoint = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { checkpointId } = req.params;

        const existing = await prisma.patrolCheckpoint.findFirst({
            where: { id: checkpointId, patrolSite: { tenantId } },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Checkpoint not found",
            });
        }

        const allowedFields = ["name", "description", "isActive"];
        const filteredData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                filteredData[field] = req.body[field];
            }
        }

        if (Object.keys(filteredData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        const updated = await prisma.patrolCheckpoint.update({
            where: { id: checkpointId },
            data: filteredData,
        });

        logger.info(`Updated checkpoint ${checkpointId}`);
        await addLog(actorId, tenantId, "UPDATE", "PatrolCheckpoint", checkpointId, filteredData, req);

        return res.status(200).json({
            success: true,
            data: updated,
            message: "Checkpoint updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating checkpoint: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update checkpoint",
        });
    }
};

// ---------------------------------------------------------
// DELETE /patrol/checkpoints/:checkpointId
// ---------------------------------------------------------
export const deleteCheckpoint = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { checkpointId } = req.params;

        const existing = await prisma.patrolCheckpoint.findFirst({
            where: { id: checkpointId, patrolSite: { tenantId } },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Checkpoint not found",
            });
        }

        // Soft delete — keeps historical scan events intact
        await prisma.patrolCheckpoint.update({
            where: { id: checkpointId },
            data: { isActive: false },
        });

        logger.info(`Deactivated checkpoint ${checkpointId}`);
        await addLog(actorId, tenantId, "DELETE", "PatrolCheckpoint", checkpointId, {}, req);

        return res.status(200).json({
            success: true,
            message: "Checkpoint deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting checkpoint: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete checkpoint",
        });
    }
};

// ---------------------------------------------------------
// POST /patrol/schedules
// ---------------------------------------------------------
export const createSchedule = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const {
            patrolSiteId,
            assignedUserId,
            name,
            intervalHours,
            windowStartTime,
            windowEndTime,
            requireAllPoints,
            minCheckpoints,
        } = req.body;

        if (!patrolSiteId || !assignedUserId || !name) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "patrolSiteId, assignedUserId, and name are required",
            });
        }

        const site = await prisma.patrolSite.findFirst({
            where: { id: patrolSiteId, tenantId, deletedAt: null },
        });

        if (!site) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Patrol site not found",
            });
        }

        const user = await prisma.user.findFirst({
            where: { id: assignedUserId, tenantId, isDeleted: false },
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        const schedule = await prisma.patrolSchedule.create({
            data: {
                tenantId,
                patrolSiteId,
                assignedUserId,
                name: name.trim(),
                intervalHours: intervalHours ?? 2,
                windowStartTime: windowStartTime ?? "08:00",
                windowEndTime: windowEndTime ?? "20:00",
                requireAllPoints: requireAllPoints ?? true,
                minCheckpoints: minCheckpoints ?? null,
            },
            include: {
                patrolSite: { select: { id: true, name: true } },
                assignedUser: { select: { id: true, name: true, employeeId: true } },
            },
        });

        logger.info(`Created patrol schedule ${schedule.id} for tenant ${tenantId}`);
        await addLog(actorId, tenantId, "CREATE", "PatrolSchedule", schedule.id, { name: schedule.name }, req);

        return res.status(201).json({
            success: true,
            data: schedule,
            message: "Patrol schedule created successfully",
        });
    } catch (error) {
        logger.error(`Error creating patrol schedule: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create patrol schedule",
        });
    }
};

// ---------------------------------------------------------
// GET /patrol/schedules  (?siteId=&userId=)
// ---------------------------------------------------------
export const getSchedules = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const page = parseInt(req.query.page || 1);
        const limit = parseInt(req.query.limit || 10);
        const skip = (page - 1) * limit;

        const where = {
            tenantId,
            deletedAt: null,
        };

        const [schedules, total] = await Promise.all([
            prisma.patrolSchedule.findMany({
            where,
            include: {
                patrolSite: { select: { id: true, name: true } },
                assignedUser: { select: { id: true, name: true, employeeId: true } },
                _count: { select: { sessions: true } },
            },
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
        }),
        prisma.patrolSchedule.count({ where }),
    ]);

        const totalPages = Math.ceil(total / limit);

        return res.status(200).json({
            success: true,
            data: schedules,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        });
    } catch (error) {
        logger.error(`Error fetching patrol schedules: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch patrol schedules",
        });
    }
};

// ---------------------------------------------------------
// PATCH /patrol/schedules/:scheduleId
// ---------------------------------------------------------
export const updateSchedule = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { scheduleId } = req.params;

        const existing = await prisma.patrolSchedule.findFirst({
            where: { id: scheduleId, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Patrol schedule not found",
            });
        }

        const allowedFields = [
            "name",
            "intervalHours",
            "windowStartTime",
            "windowEndTime",
            "requireAllPoints",
            "minCheckpoints",
            "isActive",
        ];

        const filteredData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                filteredData[field] = req.body[field];
            }
        }

        if (Object.keys(filteredData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update",
            });
        }

        const updated = await prisma.patrolSchedule.update({
            where: { id: scheduleId },
            data: filteredData,
            include: {
                patrolSite: { select: { id: true, name: true } },
                assignedUser: { select: { id: true, name: true, employeeId: true } },
            },
        });

        logger.info(`Updated patrol schedule ${scheduleId}`);
        await addLog(actorId, tenantId, "UPDATE", "PatrolSchedule", scheduleId, filteredData, req);

        return res.status(200).json({
            success: true,
            data: updated,
            message: "Patrol schedule updated successfully",
        });
    } catch (error) {
        logger.error(`Error updating patrol schedule: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update patrol schedule",
        });
    }
};

// ---------------------------------------------------------
// DELETE /patrol/schedules/:scheduleId
// ---------------------------------------------------------
export const deleteSchedule = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { scheduleId } = req.params;

        const existing = await prisma.patrolSchedule.findFirst({
            where: { id: scheduleId, tenantId, deletedAt: null },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Patrol schedule not found",
            });
        }

        await prisma.patrolSchedule.update({
            where: { id: scheduleId },
            data: { deletedAt: new Date(), isActive: false },
        });

        logger.info(`Soft deleted patrol schedule ${scheduleId}`);
        await addLog(actorId, tenantId, "DELETE", "PatrolSchedule", scheduleId, {}, req);

        return res.status(200).json({
            success: true,
            message: "Patrol schedule deleted successfully",
        });
    } catch (error) {
        logger.error(`Error deleting patrol schedule: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to delete patrol schedule",
        });
    }
};

// ---------------------------------------------------------
// GET /patrol/me/schedules — assigned patrol schedules for current user
// ---------------------------------------------------------
export const getMySchedules = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const userId = req.user?.id;

        if (!tenantId || !userId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Tenant or user context required",
            });
        }

        const schedules = await prisma.patrolSchedule.findMany({
            where: {
                tenantId,
                assignedUserId: userId,
                deletedAt: null,
                isActive: true,
            },
            include: {
                patrolSite: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: "desc" },
        });

        return res.status(200).json({
            success: true,
            data: schedules,
        });
    } catch (error) {
        logger.error(`Error fetching my patrol schedules: ${error.message}`, {
            error: error.stack,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch patrol schedules",
        });
    }
};

// ---------------------------------------------------------
// GET /patrol/me/sessions — sessions for current user (?page=&limit=)
// ---------------------------------------------------------
export const getMySessions = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const userId = req.user?.id;

        if (!tenantId || !userId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Tenant or user context required",
            });
        }

        const page = Math.max(1, parseInt(req.query.page || "1", 10));
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
        const skip = (page - 1) * limit;

        const where = {
            assignedUserId: userId,
            patrolSchedule: { tenantId },
        };

        const [sessions, total] = await Promise.all([
            prisma.patrolSession.findMany({
                where,
                include: {
                    patrolSchedule: {
                        select: {
                            name: true,
                            patrolSite: { select: { id: true, name: true } },
                        },
                    },
                },
                orderBy: { slotStart: "desc" },
                skip,
                take: limit,
            }),
            prisma.patrolSession.count({ where }),
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        return res.status(200).json({
            success: true,
            data: sessions,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        });
    } catch (error) {
        logger.error(`Error fetching my patrol sessions: ${error.message}`, {
            error: error.stack,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch patrol sessions",
        });
    }
};

// GET /patrol/sessions
// Query params: siteId, userId, status, from, to, page, limit
export const getSessions = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const {
            siteId,
            userId,
            status,
            from,
            to,
            search,
        } = req.query;

        const page = Math.max(1, parseInt(req.query.page || 1));
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || 10)));
        const skip = (page - 1) * limit;

        const validStatuses = ["IN_PROGRESS", "COMPLETED", "INCOMPLETE", "MISSED"];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
            });
        }

        const where = {
            patrolSchedule: {
                tenantId,
                ...(siteId && { patrolSiteId: siteId }),
            },
            ...(userId && { assignedUserId: userId }),
            ...(status && { status }),
            ...(from && { slotStart: { gte: new Date(from) } }),
            ...(to && { slotEnd: { lte: new Date(to) } }),
            // Search: guard name / employee id, site name, schedule name
            ...(search && {
                OR: [
                    {
                        assignedUser: {
                            name: { contains: search, mode: "insensitive" },
                        },
                    },
                    {
                        assignedUser: {
                            employeeId: { contains: search, mode: "insensitive" },
                        },
                    },
                    {
                        patrolSchedule: {
                            name: { contains: search, mode: "insensitive" },
                        },
                    },
                    {
                        patrolSchedule: {
                            patrolSite: {
                                name: { contains: search, mode: "insensitive" },
                            },
                        },
                    },
                ],
            }),
        };

        const [sessions, total] = await Promise.all([
            prisma.patrolSession.findMany({
                where,
                include: {
                    assignedUser: { select: { id: true, name: true, employeeId: true } },
                    patrolSchedule: {
                        select: {
                            name: true,
                            intervalHours: true,
                            patrolSite: { select: { id: true, name: true } },
                        },
                    },
                    scanEvents: {
                        include: { checkpoint: { select: { id: true, name: true } } },
                    },
                },
                orderBy: { slotStart: "desc" },
                skip,
                take: limit,
            }),
            prisma.patrolSession.count({ where }),
        ]);

        const totalPages = Math.max(1, Math.ceil(total / limit));

        return res.status(200).json({
            success: true,
            data: sessions,
            pagination: {
                total,
                page: page,
                limit: limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
                totalPages,
            },
        });
    } catch (error) {
        logger.error(`Error fetching patrol sessions: ${error.message}`, {
            error: error.stack,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch patrol sessions",
        });
    }
};


// Creates site + checkpoints in one transaction
export const setupSite = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const actorId = req.user.id;
        const { name, description, checkpoints } = req.body;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Site name is required",
            });
        }

        if (!checkpoints || !Array.isArray(checkpoints) || checkpoints.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "At least one checkpoint is required",
            });
        }

        // Validate checkpoint names
        const invalidCheckpoint = checkpoints.find(
            (c) => !c.name || typeof c.name !== "string" || !c.name.trim()
        );
        if (invalidCheckpoint) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "All checkpoints must have a valid name",
            });
        }

        const site = await prisma.$transaction(async (tx) => {
            const newSite = await tx.patrolSite.create({
                data: {
                    tenantId,
                    name: name.trim(),
                    description: description ?? null,
                },
            });

            await tx.patrolCheckpoint.createMany({
                data: checkpoints.map((c) => ({
                    patrolSiteId: newSite.id,
                    name: c.name.trim(),
                    description: c.description ?? null,
                    // token auto-generated per record by DB default
                })),
            });

            return tx.patrolSite.findUnique({
                where: { id: newSite.id },
                include: {
                    checkpoints: { orderBy: { createdAt: "asc" } },
                    _count: { select: { checkpoints: true, schedules: true } },
                },
            });
        });

        logger.info(`Setup patrol site ${site.id} with ${checkpoints.length} checkpoints`);
        await addLog(actorId, tenantId, "CREATE", "PatrolSite", site.id, {
            name: site.name,
            checkpointsCreated: checkpoints.length,
        }, req);

        return res.status(201).json({
            success: true,
            data: site,
            message: `Site created with ${checkpoints.length} checkpoint(s)`,
        });
    } catch (error) {
        if (error.code === "P2002") {
            return res.status(409).json({
                success: false,
                error: "Conflict",
                message: "A patrol site with this name already exists",
            });
        }

        logger.error(`Error setting up patrol site: ${error.message}`, { error: error.stack });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to setup patrol site",
        });
    }
};