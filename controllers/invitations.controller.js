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
    const { email, role, departmentId, positionId } = req.body;
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

    // Validate department if provided
    if (departmentId) {
      const department = await prisma.department.findFirst({
        where: {
          id: departmentId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!department) {
        return res.status(404).json({
          success: false,
          message: "Department not found or does not belong to this tenant",
        });
      }
    }

    // Validate position if provided
    if (positionId) {
      const position = await prisma.position.findFirst({
        where: {
          id: positionId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!position) {
        return res.status(404).json({
          success: false,
          message: "Position not found or does not belong to this tenant",
        });
      }
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
        departmentId: departmentId || null,
        positionId: positionId || null,
        token,
        expiresAt: expiryDate,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        position: {
          select: {
            id: true,
            title: true,
            code: true,
          },
        },
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
        department: newInvitation.department,
        position: newInvitation.position,
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
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        position: {
          select: {
            id: true,
            title: true,
            code: true,
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

    // Check if invitation is already accepted
    if (invitation.status === "ACCEPTED") {
      return res.status(400).json({
        success: false,
        message: "This invitation has already been accepted",
      });
    }

    // Check if invitation is expired
    if (invitation.expiresAt < new Date()) {
      // Update status to EXPIRED if not already set
      if (invitation.status !== "EXPIRED") {
        await prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: "EXPIRED" },
        });
      }
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
      // Update invitation status since user already exists
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: "ACCEPTED" },
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
          departmentId: invitation.departmentId || null,
          positionId: invitation.positionId || null,
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

    // Update invitation status to ACCEPTED after successful account creation
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED" },
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
        department: invitation.department,
        position: invitation.position,
      },
    });
  } catch (error) {
    logger.error(`Error in acceptInvitation controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Get all invitations for the current tenant with filtering and pagination
 * Only authenticated users can view invitations
 */
export const getInvitations = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const tenantId = req.user.tenantId;
    const userRole = req.user.role;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message: "Tenant ID is required",
      });
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100); // Max 100 per page
    const skip = (page - 1) * limit;

    // Filtering
    const search = req.query.search?.trim() || "";
    const email = req.query.email?.trim();
    const role = req.query.role;
    const departmentId = req.query.departmentId;
    const positionId = req.query.positionId;

    // Build where clause
    const where = {
      tenantId, // Always filter by tenant
    };

    // Role-based filtering: Non-admins can only see their own invitations
    if (userRole !== "HR_ADMIN") {
      where.email = req.user.email;
    }

    // Search by email (case-insensitive)
    if (search) {
      where.email = {
        contains: search,
        mode: "insensitive",
      };
    } else if (email) {
      where.email = email;
    }

    // Filter by role
    if (role) {
      const validRoles = ["HR_ADMIN", "HR_STAFF", "EMPLOYEE"];
      if (validRoles.includes(role)) {
        where.role = role;
      }
    }

    // Filter by department
    if (departmentId) {
      where.departmentId = departmentId;
    }

    // Filter by position
    if (positionId) {
      where.positionId = positionId;
    }

    // Filter by status
    if (req.query.status) {
      const validStatuses = ["PENDING", "ACCEPTED", "EXPIRED"];
      if (validStatuses.includes(req.query.status.toUpperCase())) {
        where.status = req.query.status.toUpperCase();
      }
    }

    // Sorting
    const sortOrder =
      req.query.sortOrder?.toLowerCase() === "asc" ? "asc" : "desc";
    const sortBy = req.query.sortBy || "createdAt";
    const validSortFields = [
      "createdAt",
      "expiresAt",
      "email",
      "role",
      "status",
    ];
    const orderByField = validSortFields.includes(sortBy)
      ? sortBy
      : "createdAt";

    // Execute query
    const [invitations, total] = await Promise.all([
      prisma.invitation.findMany({
        where,
        skip,
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          position: {
            select: {
              id: true,
              title: true,
              code: true,
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
          [orderByField]: sortOrder,
        },
      }),
      prisma.invitation.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: "Invitations retrieved successfully",
      data: invitations,
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
    logger.error(`Error in getInvitations controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};
