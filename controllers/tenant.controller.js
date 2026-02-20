import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

/**
 * GET /api/tenant/payroll-settings
 * Returns Gambia statutory and employer SSN settings for the current tenant.
 */
export const getPayrollSettings = async (req, res) => {
    try {
        const { tenantId } = req.user;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                gambiaStatutoryEnabled: true,
                employerSocialSecurityRate: true,
                allowPastPayPeriodCreation: true,
                maxPayPeriodLookbackDays: true,
            },
        });

        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Tenant not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                gambiaStatutoryEnabled: tenant.gambiaStatutoryEnabled ?? false,
                employerSocialSecurityRate: tenant.employerSocialSecurityRate ?? null,
                allowPastPayPeriodCreation: tenant.allowPastPayPeriodCreation ?? true,
                maxPayPeriodLookbackDays: tenant.maxPayPeriodLookbackDays ?? null,
            },
        });
    } catch (error) {
        logger.error(`Error fetching tenant payroll settings: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payroll settings",
        });
    }
};

/**
 * PATCH /api/tenant/payroll-settings
 * Updates Gambia statutory and optional employer SSN rate.
 * Body: { gambiaStatutoryEnabled?: boolean, employerSocialSecurityRate?: number | null, allowPastPayPeriodCreation?: boolean, maxPayPeriodLookbackDays?: number | null }
 */
export const updatePayrollSettings = async (req, res) => {
    try {
        const { tenantId, id: userId } = req.user;
        const { gambiaStatutoryEnabled, employerSocialSecurityRate, allowPastPayPeriodCreation, maxPayPeriodLookbackDays } = req.body;

        const updateData = {};
        if (typeof gambiaStatutoryEnabled === "boolean") {
            updateData.gambiaStatutoryEnabled = gambiaStatutoryEnabled;
        }
        if (employerSocialSecurityRate !== undefined) {
            updateData.employerSocialSecurityRate =
                employerSocialSecurityRate == null || employerSocialSecurityRate === ""
                    ? null
                    : Number(employerSocialSecurityRate);
        }
        if (typeof allowPastPayPeriodCreation === "boolean") {
            updateData.allowPastPayPeriodCreation = allowPastPayPeriodCreation;
        }
        if (maxPayPeriodLookbackDays !== undefined) {
            if (maxPayPeriodLookbackDays == null || maxPayPeriodLookbackDays === "") {
                updateData.maxPayPeriodLookbackDays = null;
            } else {
                const val = Number(maxPayPeriodLookbackDays);
                if (!Number.isInteger(val) || val < 0 || val > 1095) {
                    return res.status(400).json({
                        success: false,
                        error: "Bad Request",
                        message: "maxPayPeriodLookbackDays must be between 0 and 1095, or null for unlimited",
                    });
                }
                updateData.maxPayPeriodLookbackDays = val;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update (gambiaStatutoryEnabled, employerSocialSecurityRate, allowPastPayPeriodCreation, maxPayPeriodLookbackDays)",
            });
        }

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData,
            select: {
                gambiaStatutoryEnabled: true,
                employerSocialSecurityRate: true,
                allowPastPayPeriodCreation: true,
                maxPayPeriodLookbackDays: true,
            },
        });

        logger.info(`Tenant payroll settings updated`, {
            tenantId,
            userId,
            updates: Object.keys(updateData),
        });

        return res.status(200).json({
            success: true,
            data: {
                gambiaStatutoryEnabled: tenant.gambiaStatutoryEnabled ?? false,
                employerSocialSecurityRate: tenant.employerSocialSecurityRate ?? null,
                allowPastPayPeriodCreation: tenant.allowPastPayPeriodCreation ?? true,
                maxPayPeriodLookbackDays: tenant.maxPayPeriodLookbackDays ?? null,
            },
            message: "Payroll settings updated",
        });
    } catch (error) {
        logger.error(`Error updating tenant payroll settings: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update payroll settings",
        });
    }
};
