import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

export function normalizeOrgLabel(s) {
    if (s == null || typeof s !== "string") return "";
    return s.trim().replace(/\s+/g, " ");
}

/**
 * Case-insensitive map key for department/position lookups within a batch.
 */
export function orgMapKey(s) {
    return normalizeOrgLabel(s).toLowerCase();
}

/**
 * @param {string} tenantId
 * @param {string} displayName
 * @param {Map<string, string>} cache - key: lower name -> department id
 */
export async function getOrCreateDepartment(tenantId, displayName, cache) {
    const name = normalizeOrgLabel(displayName);
    if (!name) return null;

    const key = orgMapKey(name);
    if (cache?.has(key)) return cache.get(key);

    const existing = await prisma.department.findFirst({
        where: {
            tenantId,
            deletedAt: null,
            name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
    });
    if (existing) {
        cache?.set(key, existing.id);
        return existing.id;
    }

    try {
        const created = await prisma.department.create({
            data: { tenantId, name },
            select: { id: true },
        });
        cache?.set(key, created.id);
        return created.id;
    } catch (e) {
        if (e.code === "P2002") {
            const again = await prisma.department.findFirst({
                where: { tenantId, deletedAt: null, name: { equals: name, mode: "insensitive" } },
                select: { id: true },
            });
            if (again) {
                cache?.set(key, again.id);
                return again.id;
            }
        }
        logger.error(`getOrCreateDepartment failed: ${e.message}`);
        throw e;
    }
}

/**
 * @param {string} tenantId
 * @param {string} title
 * @param {Map<string, string>} cache - key: lower title -> position id
 */
export async function getOrCreatePosition(tenantId, title, cache) {
    const t = normalizeOrgLabel(title);
    if (!t) return null;

    const key = orgMapKey(t);
    if (cache?.has(key)) return cache.get(key);

    const existing = await prisma.position.findFirst({
        where: {
            tenantId,
            deletedAt: null,
            title: { equals: t, mode: "insensitive" },
        },
        select: { id: true },
    });
    if (existing) {
        cache?.set(key, existing.id);
        return existing.id;
    }

    try {
        const created = await prisma.position.create({
            data: { tenantId, title: t },
            select: { id: true },
        });
        cache?.set(key, created.id);
        return created.id;
    } catch (e) {
        if (e.code === "P2002") {
            const again = await prisma.position.findFirst({
                where: { tenantId, deletedAt: null, title: { equals: t, mode: "insensitive" } },
                select: { id: true },
            });
            if (again) {
                cache?.set(key, again.id);
                return again.id;
            }
        }
        logger.error(`getOrCreatePosition failed: ${e.message}`);
        throw e;
    }
}

/** Read-only: existing department id by display name, or null. */
export async function findDepartmentIdByName(tenantId, displayName) {
    const name = normalizeOrgLabel(displayName);
    if (!name) return null;
    const existing = await prisma.department.findFirst({
        where: {
            tenantId,
            deletedAt: null,
            name: { equals: name, mode: "insensitive" },
        },
        select: { id: true },
    });
    return existing?.id ?? null;
}

/** Read-only: existing position id by title, or null. */
export async function findPositionIdByTitle(tenantId, title) {
    const t = normalizeOrgLabel(title);
    if (!t) return null;
    const existing = await prisma.position.findFirst({
        where: {
            tenantId,
            deletedAt: null,
            title: { equals: t, mode: "insensitive" },
        },
        select: { id: true },
    });
    return existing?.id ?? null;
}
