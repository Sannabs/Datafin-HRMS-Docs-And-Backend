import crypto from "crypto";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { auth } from "../utils/auth.js";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";

/**
 * Send an invitation to a user
 * Only HR_ADMIN can send invitations
 */
export const sendInvitation = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    const tenantId = req.user.tenantId;
    const senderId = req.user.id;
    const senderRole = req.user.role;

    // Validation
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    // Validate role enum
    const validRoles = ["HR_ADMIN", "HR_STAFF", "EMPLOYEE"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Invalid role. Must be one of: HR_ADMIN, HR_STAFF, EMPLOYEE",
      });
    }

    if (!tenantId || !senderId) {
      return res.status(400).json({
        success: false,
        message: "Sender ID and tenant ID are required",
      });
    }

    if (senderRole !== "HR_ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Only HR_ADMIN can send invitations",
      });
    }

    // Check if user already exists in this tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        tenantId,
        isDeleted: false,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists in this tenant",
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString("base64url");
    const expiryDate = new Date(Date.now() + 1000 * 60 * 60 * 48); // 48 hours

    // Check for pending invitation (not expired)
    const pendingInvite = await prisma.invitation.findFirst({
      where: {
        email,
        tenantId,
        expiresAt: {
          gte: new Date(), // Not expired
        },
      },
    });

    if (pendingInvite) {
      return res.status(409).json({
        success: false,
        message: "A pending invitation already exists for this email",
      });
    }

    // Create invitation
    const newInvitation = await prisma.invitation.create({
      data: {
        senderId,
        tenantId,
        email,
        role,
        token,
        expiresAt: expiryDate,
      },
    });

    logger.info(
      `Invitation sent to ${email} by ${senderId} for tenant ${tenantId}`
    );

    res.status(201).json({
      success: true,
      message: "Invitation sent successfully",
      data: {
        invitationId: newInvitation.id,
        email: newInvitation.email,
        role: newInvitation.role,
        expiresAt: newInvitation.expiresAt,
      },
    });
  } catch (error) {
    logger.error(`Error in sendInvitation controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};

export const getInvitations = async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const userRole = req.user.role;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    // Build query based on role
    const where = {
      tenantId,
    };

    // HR_STAFF and EMPLOYEE can only see invitations sent to them
    if (userRole !== "HR_ADMIN") {
      where.email = req.user.email;
    }

    const invitations = await prisma.invitation.findMany({
      where,
      include: {
        sender: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Filter out expired invitations for non-admin users
    const now = new Date();
    const filteredInvitations = invitations.map((invitation) => {
      const isExpired = invitation.expiresAt < now;
      return {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        isExpired,
        createdAt: invitation.createdAt,
        sender: invitation.sender,
        tenant: invitation.tenant,
      };
    });

    res.status(200).json({
      success: true,
      message: "Invitations retrieved successfully",
      data: filteredInvitations,
    });
  } catch (error) {
    logger.error(`Error in getInvitations controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};

export const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password, name } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invitation token is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // Find invitation by token
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        tenant: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invalid invitation token",
      });
    }

    // Check if invitation is expired
    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Invitation has expired",
      });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        email: invitation.email,
        tenantId: invitation.tenantId,
        isDeleted: false,
      },
    });

    if (existingUser) {
      // Delete the invitation since user already exists
      await prisma.invitation.delete({
        where: { id: invitation.id },
      });

      return res.status(409).json({
        success: false,
        message: "User with this email already exists",
      });
    }

    // Generate employee ID
    const employeeId = await generateEmployeeId(
      invitation.tenantId,
      invitation.tenant.code
    );

    // Create user account using Better Auth
    let signUpResult;
    try {
      signUpResult = await auth.api.signUpEmail({
        body: {
          email: invitation.email,
          password,
          name: name || null,
          tenantId: invitation.tenantId,
          role: invitation.role,
          employeeId: employeeId,
          status: "ACTIVE",
          employmentType: "FULL_TIME",
        },
        headers: req.headers,
      });
    } catch (authError) {
      logger.error(
        `Failed to create user account for invitation: ${authError.message}`
      );
      return res.status(400).json({
        success: false,
        message: "Failed to create account. Please try again.",
        error:
          process.env.NODE_ENV === "development"
            ? authError.message
            : undefined,
      });
    }

    if (!signUpResult?.user) {
      return res.status(500).json({
        success: false,
        message: "Failed to create user account",
      });
    }

    // Delete the invitation after successful account creation
    await prisma.invitation.delete({
      where: { id: invitation.id },
    });

    logger.info(
      `Invitation accepted: ${invitation.email} created account for tenant ${invitation.tenantId}`
    );

    res.status(201).json({
      success: true,
      message:
        "Account created successfully. Please check your email for verification.",
      data: {
        user: {
          id: signUpResult.user.id,
          email: signUpResult.user.email,
          role: signUpResult.user.role,
        },
        tenant: {
          id: invitation.tenant.id,
          name: invitation.tenant.name,
          code: invitation.tenant.code,
        },
      },
    });
  } catch (error) {
    logger.error(`Error in acceptInvitation controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};
