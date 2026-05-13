import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

const COMPANY_INFO_SELECT = {
    name: true,
    code: true,
    address: true,
    addressLine1: true,
    addressLine2: true,
    phone: true,
    email: true,
    website: true,
    employerTin: true,
};

/**
 * GET /api/tenant
 * Returns company info (profile) for the current tenant.
 */
export const getTenantProfile = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: COMPANY_INFO_SELECT,
        });

        if (!tenant) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Tenant not found",
            });
        }

        const line1 = (tenant.addressLine1 ?? (tenant.address && String(tenant.address).trim())) || null;
        const line2 = tenant.addressLine2 ?? null;

        return res.status(200).json({
            success: true,
            data: {
                name: tenant.name ?? "",
                code: tenant.code ?? "",
                addressLine1: line1,
                addressLine2: line2,
                phone: tenant.phone ?? null,
                email: tenant.email ?? null,
                website: tenant.website ?? null,
                employerTin: tenant.employerTin ?? null,
            },
        });
    } catch (error) {
        logger.error(`Error fetching tenant profile: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch company info",
        });
    }
};

/**
 * PATCH /api/tenant
 * Updates company info (including code).
 * Body: { name?, code?, addressLine1?, addressLine2?, phone?, email?, website?, employerTin? }
 */
export const updateTenantProfile = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const { id: userId } = req.user;
        const { name, code, addressLine1, addressLine2, phone, email, website, employerTin } = req.body;

        const updateData = {};
        if (name !== undefined) {
            const trimmed = typeof name === "string" ? name.trim() : "";
            if (!trimmed) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Company name is required",
                });
            }
            updateData.name = trimmed;
        }
        if (code !== undefined) {
            const trimmed = typeof code === "string" ? code.trim() : "";
            if (!trimmed) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Company code is required",
                });
            }
            const existing = await prisma.tenant.findFirst({
                where: {
                    code: trimmed,
                    id: { not: tenantId },
                },
                select: { id: true },
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "Another company already uses this code",
                });
            }
            updateData.code = trimmed;
        }
        if (addressLine1 !== undefined) {
            updateData.addressLine1 = addressLine1 == null || addressLine1 === "" ? null : String(addressLine1).trim();
        }
        if (addressLine2 !== undefined) {
            updateData.addressLine2 = addressLine2 == null || addressLine2 === "" ? null : String(addressLine2).trim();
        }
        if (phone !== undefined) {
            updateData.phone = phone == null || phone === "" ? null : String(phone).trim();
        }
        if (email !== undefined) {
            updateData.email = email == null || email === "" ? null : String(email).trim();
        }
        if (website !== undefined) {
            updateData.website = website == null || website === "" ? null : String(website).trim();
        }
        if (employerTin !== undefined) {
            updateData.employerTin =
                employerTin == null || employerTin === "" ? null : String(employerTin).trim();
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message:
                    "No valid fields to update (name, code, addressLine1, addressLine2, phone, email, website, employerTin)",
            });
        }

        // Keep legacy address in sync for payslip and other consumers
        if (updateData.addressLine1 !== undefined || updateData.addressLine2 !== undefined) {
            const current = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { addressLine1: true, addressLine2: true },
            });
            const line1 = updateData.addressLine1 !== undefined ? updateData.addressLine1 : (current?.addressLine1 ?? null);
            const line2 = updateData.addressLine2 !== undefined ? updateData.addressLine2 : (current?.addressLine2 ?? null);
            updateData.address = [line1, line2].filter(Boolean).join("\n") || null;
        }

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData,
            select: COMPANY_INFO_SELECT,
        });

        logger.info("Tenant profile (company info) updated", {
            tenantId,
            userId,
            updates: Object.keys(updateData),
        });

        return res.status(200).json({
            success: true,
            data: {
                name: tenant.name ?? "",
                code: tenant.code ?? "",
                addressLine1: tenant.addressLine1 ?? null,
                addressLine2: tenant.addressLine2 ?? null,
                phone: tenant.phone ?? null,
                email: tenant.email ?? null,
                website: tenant.website ?? null,
                employerTin: tenant.employerTin ?? null,
            },
            message: "Company info updated",
        });
    } catch (error) {
        logger.error(`Error updating tenant profile: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to update company info",
        });
    }
};

/**
 * GET /api/tenant/payroll-settings
 * Returns Gambia statutory and employer SSN settings for the current tenant.
 */
export const getPayrollSettings = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: {
                gambiaStatutoryEnabled: true,
                employerSocialSecurityRate: true,
                gambiaSsnFundingMode: true,
                allowPastPayPeriodCreation: true,
                maxPayPeriodLookbackDays: true,
                gambiaTaxAgeExemptionEnabled: true,
                gambiaTaxExemptionAge: true,
                overtimeEnabled: true,
                overtimePayMultiplier: true,
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
                gambiaSsnFundingMode: tenant.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE",
                allowPastPayPeriodCreation: tenant.allowPastPayPeriodCreation ?? true,
                maxPayPeriodLookbackDays: tenant.maxPayPeriodLookbackDays ?? null,
                gambiaTaxAgeExemptionEnabled: tenant.gambiaTaxAgeExemptionEnabled ?? false,
                gambiaTaxExemptionAge: tenant.gambiaTaxExemptionAge ?? null,
                overtimeEnabled: tenant.overtimeEnabled ?? true,
                overtimePayMultiplier:
                    tenant.overtimePayMultiplier != null ? Number(tenant.overtimePayMultiplier) : 1.5,
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
        const { id: userId } = req.user;
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;
        const {
            gambiaStatutoryEnabled,
            employerSocialSecurityRate,
            gambiaSsnFundingMode,
            allowPastPayPeriodCreation,
            maxPayPeriodLookbackDays,
            gambiaTaxAgeExemptionEnabled,
            gambiaTaxExemptionAge,
            overtimeEnabled,
            overtimePayMultiplier,
        } = req.body;

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
        if (gambiaSsnFundingMode !== undefined) {
            const allowed = ["DEDUCT_FROM_EMPLOYEE", "EMPLOYER_PAYS_ON_BEHALF"];
            if (!allowed.includes(gambiaSsnFundingMode)) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "gambiaSsnFundingMode must be DEDUCT_FROM_EMPLOYEE or EMPLOYER_PAYS_ON_BEHALF",
                });
            }
            updateData.gambiaSsnFundingMode = gambiaSsnFundingMode;
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
        if (typeof gambiaTaxAgeExemptionEnabled === "boolean") {
            updateData.gambiaTaxAgeExemptionEnabled = gambiaTaxAgeExemptionEnabled;
        }
        if (gambiaTaxExemptionAge !== undefined) {
            if (gambiaTaxExemptionAge == null || gambiaTaxExemptionAge === "") {
                updateData.gambiaTaxExemptionAge = null;
            } else {
                const age = Number(gambiaTaxExemptionAge);
                if (!Number.isInteger(age) || age <= 0 || age > 100) {
                    return res.status(400).json({
                        success: false,
                        error: "Bad Request",
                        message: "gambiaTaxExemptionAge must be an integer between 1 and 100, or null to disable",
                    });
                }
                updateData.gambiaTaxExemptionAge = age;
            }
        }
        if (typeof overtimeEnabled === "boolean") {
            updateData.overtimeEnabled = overtimeEnabled;
        }
        if (overtimePayMultiplier !== undefined) {
            const m = Number(overtimePayMultiplier);
            if (Number.isNaN(m) || m <= 0 || m > 10) {
                return res.status(400).json({
                    success: false,
                    error: "Bad Request",
                    message: "overtimePayMultiplier must be a number greater than 0 and up to 10 (e.g. 1.5)",
                });
            }
            updateData.overtimePayMultiplier = m;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No valid fields to update (gambiaStatutoryEnabled, gambiaSsnFundingMode, employerSocialSecurityRate, allowPastPayPeriodCreation, maxPayPeriodLookbackDays, gambiaTaxAgeExemptionEnabled, gambiaTaxExemptionAge, overtimeEnabled, overtimePayMultiplier)",
            });
        }

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData,
            select: {
                gambiaStatutoryEnabled: true,
                employerSocialSecurityRate: true,
                gambiaSsnFundingMode: true,
                allowPastPayPeriodCreation: true,
                maxPayPeriodLookbackDays: true,
                gambiaTaxAgeExemptionEnabled: true,
                gambiaTaxExemptionAge: true,
                overtimeEnabled: true,
                overtimePayMultiplier: true,
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
                gambiaSsnFundingMode: tenant.gambiaSsnFundingMode ?? "DEDUCT_FROM_EMPLOYEE",
                allowPastPayPeriodCreation: tenant.allowPastPayPeriodCreation ?? true,
                maxPayPeriodLookbackDays: tenant.maxPayPeriodLookbackDays ?? null,
                gambiaTaxAgeExemptionEnabled: tenant.gambiaTaxAgeExemptionEnabled ?? false,
                gambiaTaxExemptionAge: tenant.gambiaTaxExemptionAge ?? null,
                overtimeEnabled: tenant.overtimeEnabled ?? true,
                overtimePayMultiplier:
                    tenant.overtimePayMultiplier != null ? Number(tenant.overtimePayMultiplier) : 1.5,
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
