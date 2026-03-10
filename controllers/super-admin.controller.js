import crypto from "crypto";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { ensurePlatformTenant } from "../utils/platformTenant.js";
import { auth } from "../utils/auth.js";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";
import { sendPlatformAdminInviteEmail } from "../views/sendPlatformAdminInviteEmail.js";

// Companies

export const listCompanies = async (req, res) => {
  try {
    const search = req.query.search?.trim() || "";
    const status = req.query.status?.trim() || null;
    const page = parseInt(req.query.page || "1", 10);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 100);
    const skip = (page - 1) * limit;

    const where = {
      code: { not: "platform" },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [companies, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          name: true,
          email: true,
          phone: true,
          website: true,
          createdAt: true,
          status: true,
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      data: companies,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    });
  } catch (error) {
    logger.error(`Error listing companies (super admin): ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to list companies",
    });
  }
};

export const getCompanyById = async (req, res) => {
  try {
    const { companyId } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        code: true,
        name: true,
        addressLine1: true,
        addressLine2: true,
        phone: true,
        email: true,
        website: true,
        createdAt: true,
        updatedAt: true,
        status: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Company not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    logger.error(`Error fetching company (super admin): ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch company",
    });
  }
};

export const createCompany = async (req, res) => {
  try {
    const { name, code, addressLine1, addressLine2, phone, email, website } =
      req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Name and code are required",
      });
    }

    const trimmedCode = String(code).trim();

    const existing = await prisma.tenant.findFirst({
      where: { code: trimmedCode },
      select: { id: true },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "A company with this code already exists",
      });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name: String(name).trim(),
        code: trimmedCode,
        addressLine1: addressLine1 || null,
        addressLine2: addressLine2 || null,
        phone: phone || null,
        email: email || null,
        website: website || null,
      },
      select: {
        id: true,
        code: true,
        name: true,
        addressLine1: true,
        addressLine2: true,
        phone: true,
        email: true,
        website: true,
        createdAt: true,
        status: true,
      },
    });

    logger.info("Company created by super admin", {
      tenantId: tenant.id,
      userId: req.user.id,
    });

    return res.status(201).json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    logger.error(`Error creating company (super admin): ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to create company",
    });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { name, code, addressLine1, addressLine2, phone, email, website } =
      req.body;

    const tenant = await prisma.tenant.findUnique({
      where: { id: companyId },
      select: { id: true, code: true },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Company not found",
      });
    }

    const data = {};

    if (name !== undefined) data.name = name == null ? null : String(name).trim();
    if (code !== undefined) {
      const trimmedCode = String(code).trim();
      if (!trimmedCode) {
        return res.status(400).json({
          success: false,
          error: "Bad Request",
          message: "Company code cannot be empty",
        });
      }

      const existing = await prisma.tenant.findFirst({
        where: {
          code: trimmedCode,
          id: { not: companyId },
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

      data.code = trimmedCode;
    }
    if (addressLine1 !== undefined) {
      data.addressLine1 =
        addressLine1 == null || addressLine1 === ""
          ? null
          : String(addressLine1).trim();
    }
    if (addressLine2 !== undefined) {
      data.addressLine2 =
        addressLine2 == null || addressLine2 === ""
          ? null
          : String(addressLine2).trim();
    }
    if (phone !== undefined) {
      data.phone =
        phone == null || phone === "" ? null : String(phone).trim();
    }
    if (email !== undefined) {
      data.email =
        email == null || email === "" ? null : String(email).trim();
    }
    if (website !== undefined) {
      data.website =
        website == null || website === "" ? null : String(website).trim();
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message:
          "No valid fields to update (name, code, addressLine1, addressLine2, phone, email, website)",
      });
    }

    const updated = await prisma.tenant.update({
      where: { id: companyId },
      data,
      select: {
        id: true,
        code: true,
        name: true,
        addressLine1: true,
        addressLine2: true,
        phone: true,
        email: true,
        website: true,
        status: true,
        updatedAt: true,
      },
    });

    logger.info("Company updated by super admin", {
      tenantId: updated.id,
      userId: req.user.id,
      fields: Object.keys(data),
    });

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error(`Error updating company (super admin): ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to update company",
    });
  }
};

export const activateCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const tenant = await prisma.tenant.update({
      where: { id: companyId },
      data: { status: "ACTIVE" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

    logger.info("Company activated by super admin", {
      tenantId: tenant.id,
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    logger.error(`Error activating company (super admin): ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to activate company",
    });
  }
};

export const suspendCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const tenant = await prisma.tenant.update({
      where: { id: companyId },
      data: { status: "SUSPENDED" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
      },
    });

    logger.info("Company suspended by super admin", {
      tenantId: tenant.id,
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: tenant,
    });
  } catch (error) {
    logger.error(`Error suspending company (super admin): ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to suspend company",
    });
  }
};

// Invitations for specific company

export const sendCompanyInvitationAsSuperAdmin = async (req, res, next) => {
  try {
    const { companyId } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, code: true },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    req.effectiveTenantId = tenant.id;
    req.user = {
      ...req.user,
      role: "HR_ADMIN",
    };

    return next();
  } catch (error) {
    logger.error(
      `Error preparing super-admin company invitation: ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      message: "Failed to send invitation for company",
    });
  }
};

// Platform admins

export const listPlatformAdmins = async (req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: {
        role: "SUPER_ADMIN",
        isDeleted: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        status: true,
        isPlatformOwner: true,
        createdAt: true,
        lastLogin: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json({
      success: true,
      data: admins,
    });
  } catch (error) {
    logger.error(
      `Error listing platform admins (super admin): ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to list platform admins",
    });
  }
};

export const getPlatformAdminById = async (req, res) => {
  try {
    if (!req.user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only the platform owner can view this profile",
      });
    }
    const { userId } = req.params;
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        role: "SUPER_ADMIN",
        isDeleted: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        phone: true,
        gender: true,
        dateOfBirth: true,
        SSN: true,
        tinNumber: true,
        emergencyContactName: true,
        emergencyContactRelationship: true,
        emergencyContactPhone: true,
        addressLine1: true,
        addressLine2: true,
        status: true,
        isPlatformOwner: true,
        createdAt: true,
        lastLogin: true,
      },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Platform admin not found",
      });
    }
    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error(
      `Error fetching platform admin (super admin): ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to fetch platform admin",
    });
  }
};

export const suspendPlatformAdmin = async (req, res) => {
  try {
    if (!req.user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only the platform owner can perform this action",
      });
    }
    const { userId } = req.params;
    if (req.user.id === userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "You cannot suspend yourself",
      });
    }
    const user = await prisma.user.findFirst({
      where: { id: userId, role: "SUPER_ADMIN", isDeleted: false },
      select: { id: true, isPlatformOwner: true },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Platform admin not found",
      });
    }
    if (user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Cannot suspend the platform owner",
      });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { status: "INACTIVE" },
    });
    await prisma.session.deleteMany({ where: { userId } });
    logger.info("Platform admin suspended", { userId, by: req.user.id });
    return res.status(200).json({
      success: true,
      message: "Platform admin suspended",
    });
  } catch (error) {
    logger.error(
      `Error suspending platform admin: ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to suspend platform admin",
    });
  }
};

export const activatePlatformAdmin = async (req, res) => {
  try {
    if (!req.user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only the platform owner can perform this action",
      });
    }
    const { userId } = req.params;
    if (req.user.id === userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "You cannot change your own status",
      });
    }
    const user = await prisma.user.findFirst({
      where: { id: userId, role: "SUPER_ADMIN", isDeleted: false },
      select: { id: true, isPlatformOwner: true },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Platform admin not found",
      });
    }
    if (user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Cannot activate the platform owner",
      });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { status: "ACTIVE" },
    });
    logger.info("Platform admin activated", { userId, by: req.user.id });
    return res.status(200).json({
      success: true,
      message: "Platform admin activated",
    });
  } catch (error) {
    logger.error(
      `Error activating platform admin: ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to activate platform admin",
    });
  }
};

export const deletePlatformAdmin = async (req, res) => {
  try {
    if (!req.user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only the platform owner can perform this action",
      });
    }
    const { userId } = req.params;
    if (req.user.id === userId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "You cannot delete yourself",
      });
    }
    const user = await prisma.user.findFirst({
      where: { id: userId, role: "SUPER_ADMIN", isDeleted: false },
      select: { id: true, isPlatformOwner: true },
    });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Platform admin not found",
      });
    }
    if (user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Cannot delete the platform owner",
      });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await prisma.session.deleteMany({ where: { userId } });
    logger.info("Platform admin deleted (soft)", { userId, by: req.user.id });
    return res.status(200).json({
      success: true,
      message: "Platform admin removed",
    });
  } catch (error) {
    logger.error(
      `Error deleting platform admin: ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to delete platform admin",
    });
  }
};

export const invitePlatformAdmin = async (req, res) => {
  try {
    if (!req.user.isPlatformOwner) {
      return res.status(403).json({
        success: false,
        error: "Forbidden",
        message: "Only the platform owner can invite other platform admins",
      });
    }
    const { email, name } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "Email is required",
      });
    }

    const existing = await prisma.user.findFirst({
      where: {
        email,
        role: "SUPER_ADMIN",
        isDeleted: false,
      },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "Conflict",
        message: "A platform admin with this email already exists",
      });
    }

    const platformTenant = await ensurePlatformTenant();

    const employeeId = await generateEmployeeId(
      platformTenant.id,
      platformTenant,
      null
    );

    const result = await auth.api.signUpEmail({
      body: {
        email,
        password: crypto.randomUUID(),
        name: name?.trim() || email,
        tenantId: platformTenant.id,
        role: "SUPER_ADMIN",
        employeeId,
        status: "ACTIVE",
        employmentType: "FULL_TIME",
      },
      headers: {},
    });

    if (!result?.user) {
      throw new Error("Failed to create platform admin user");
    }

    const userId = result.user.id;
    const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
    const resetToken = crypto.randomBytes(12).toString("hex");
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    await prisma.verification.create({
      data: {
        id: crypto.randomUUID(),
        identifier: `reset-password:${resetToken}`,
        value: userId,
        expiresAt,
      },
    });

    const resetUrl = `${clientUrl}/reset-password/${resetToken}`;
    await sendPlatformAdminInviteEmail({
      to: result.user.email,
      resetUrl,
      userName: name?.trim() || result.user.email,
    });

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });

    logger.info("Platform admin invited by super admin", {
      userId,
      invitedBy: req.user.id,
    });

    return res.status(201).json({
      success: true,
      message:
        "Platform admin invited. They will receive an email to set their password and sign in.",
      data: {
        id: result.user.id,
        email: result.user.email,
      },
    });
  } catch (error) {
    logger.error(
      `Error inviting platform admin (super admin): ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to invite platform admin",
    });
  }
};

// Impersonation (header-based validation only; state is held client-side)

export const startImpersonation = async (req, res) => {
  try {
    const { tenantId } = req.body || {};

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: "Bad Request",
        message: "tenantId is required",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        code: true,
      },
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: "Not Found",
        message: "Company not found",
      });
    }

    logger.info("Super admin started impersonation", {
      tenantId: tenant.id,
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantCode: tenant.code,
      },
    });
  } catch (error) {
    logger.error(
      `Error starting impersonation (super admin): ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to start impersonation",
    });
  }
};

export const stopImpersonation = async (req, res) => {
  try {
    logger.info("Super admin stopped impersonation", {
      userId: req.user.id,
    });

    return res.status(200).json({
      success: true,
      message: "Impersonation stopped",
    });
  } catch (error) {
    logger.error(
      `Error stopping impersonation (super admin): ${error.message}`,
      { stack: error.stack }
    );
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      message: "Failed to stop impersonation",
    });
  }
};

