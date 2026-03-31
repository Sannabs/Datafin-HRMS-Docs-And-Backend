import crypto from "crypto";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { hashPassword } from "better-auth/crypto";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";
import { sendInvitationEmail } from "../views/sendInvitationEmail.js";
import { parseFlexibleDate } from "../utils/date-parser.js";
import {
    hasStoredLoginCredentials,
    credentialAccountsInclude,
} from "../utils/loginCredentials.util.js";

/**
 * Send an invitation to a user
 * Only HR_ADMIN can send invitations
 */
const VALID_EMPLOYMENT_STATUSES = ["INACTIVE", "ACTIVE", "ON_LEAVE"];
const VALID_EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"];

export const sendInvitation = async (req, res, next) => {
  try {
    const {
      email,
      role,
      departmentId,
      positionId,
      dateOfBirth,
      hireDate,
      employmentStatus,
      employmentType,
      baseSalary,
      salaryPeriodType,
      salaryEffectiveDate,
      salaryCurrency,
    } = req.body;
    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
    const validRoles = ["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid role. Must be one of: HR_ADMIN, HR_STAFF, STAFF, DEPARTMENT_ADMIN",
      });
    }

    if (!tenantId || !senderId) {
      return res.status(400).json({
        success: false,
        message: "Sender ID and tenant ID are required",
      });
    }

    const canSend =
      senderRole === "HR_ADMIN" ||
      (senderRole === "SUPER_ADMIN" && req.effectiveTenantId);
    if (!canSend) {
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

      // Check if role is DEPARTMENT_ADMIN and department already has a manager
      if (role === "DEPARTMENT_ADMIN") {
        if (department.managerId) {
          // Check if the existing manager is still active
          const existingManager = await prisma.user.findFirst({
            where: {
              id: department.managerId,
              tenantId,
              isDeleted: false,
              status: "ACTIVE",
            },
          });

          if (existingManager) {
            return res.status(409).json({
              success: false,
              message: "Department already has a manager",
            });
          }
        }
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

    // Validate employment status if provided
    if (employmentStatus != null && employmentStatus !== "") {
      if (!VALID_EMPLOYMENT_STATUSES.includes(employmentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid employment status. Must be one of: ${VALID_EMPLOYMENT_STATUSES.join(", ")}`,
        });
      }
    }

    // Validate employment type if provided
    if (employmentType != null && employmentType !== "") {
      if (!VALID_EMPLOYMENT_TYPES.includes(employmentType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid employment type. Must be one of: ${VALID_EMPLOYMENT_TYPES.join(", ")}`,
        });
      }
    }

    // Validate compensation if provided (Step 2: base salary required when sending from multi-step flow)
    if (baseSalary != null && baseSalary !== "") {
      const salary = Number(baseSalary);
      if (Number.isNaN(salary) || salary < 0) {
        return res.status(400).json({
          success: false,
          message: "Base salary must be a non-negative number",
        });
      }
    }
    const validPeriodTypes = ["MONTHLY", "ANNUAL"];
    const salaryPeriodTypeVal =
      salaryPeriodType != null && validPeriodTypes.includes(String(salaryPeriodType).toUpperCase())
        ? String(salaryPeriodType).toUpperCase()
        : "MONTHLY";
    if (dateOfBirth != null && String(dateOfBirth).trim() !== "") {
      const dob = parseFlexibleDate(dateOfBirth);
      if (!dob) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth",
        });
      }
    }
    if (hireDate != null && String(hireDate).trim() !== "") {
      const hd = parseFlexibleDate(hireDate);
      if (!hd) {
        return res.status(400).json({
          success: false,
          message: "Invalid hire date",
        });
      }
    }
    if (salaryEffectiveDate != null && String(salaryEffectiveDate).trim() !== "") {
      const sd = parseFlexibleDate(salaryEffectiveDate);
      if (!sd) {
        return res.status(400).json({
          success: false,
          message: "Invalid salary effective date",
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

    // Parse optional dates and numbers
    const dateOfBirthParsed = dateOfBirth ? parseFlexibleDate(dateOfBirth) : null;
    const hireDateParsed = hireDate ? parseFlexibleDate(hireDate) : null;
    const salaryEffectiveDateParsed = salaryEffectiveDate ? parseFlexibleDate(salaryEffectiveDate) : null;
    const baseSalaryNum =
      baseSalary != null && baseSalary !== "" ? Number(baseSalary) : null;
    const salaryCurrencyVal =
      salaryCurrency != null && String(salaryCurrency).trim() !== ""
        ? String(salaryCurrency).trim()
        : "USD";

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
        dateOfBirth: dateOfBirthParsed,
        hireDate: hireDateParsed,
        employmentStatus:
          employmentStatus != null && employmentStatus !== ""
            ? employmentStatus
            : null,
        employmentType:
          employmentType != null && employmentType !== ""
            ? employmentType
            : null,
        baseSalary: baseSalaryNum,
        salaryPeriodType: salaryPeriodTypeVal,
        salaryEffectiveDate: salaryEffectiveDateParsed,
        salaryCurrency: salaryCurrencyVal,
      },
      include: {
        tenant: {
          select: {
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        position: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    // Send invitation email (primary); manual link sharing remains available in UI
    const clientUrl = process.env.NODE_ENV === "development" ?
      "http://localhost:3000"
      : process.env.CLIENT_URL

    const acceptLink = `${clientUrl}/accept-invite/${newInvitation.token}`;
    const tenantName = newInvitation.tenant?.name || "your organization";
    try {
      await sendInvitationEmail({
        to: newInvitation.email,
        acceptLink,
        tenantName,
        expiresAt: newInvitation.expiresAt,
      });
    } catch (emailError) {
      logger.error(
        `Invitation created but failed to send invitation email to ${newInvitation.email}: ${emailError.message}`,
        { stack: emailError.stack }
      );
      // Do not fail the request; invitation was created and link is in the response
    }

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
        token: newInvitation.token,
      },
    });
  } catch (error) {
    logger.error(`Error in sendInvitation controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};

export const sendSetupInvitation = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const tenantId = req.effectiveTenantId ?? req.user?.tenantId;
    const senderId = req.user?.id;
    const senderRole = req.user?.role;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    if (!tenantId || !senderId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const canSend =
      senderRole === "HR_ADMIN" ||
      senderRole === "HR_STAFF" ||
      (senderRole === "SUPER_ADMIN" && req.effectiveTenantId);
    if (!canSend) {
      return res.status(403).json({
        success: false,
        message: "Only HR users can send invitations",
      });
    }

    const employee = await prisma.user.findFirst({
      where: {
        id: employeeId,
        tenantId,
        isDeleted: false,
      },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
        departmentId: true,
        positionId: true,
        dateOfBirth: true,
        hireDate: true,
        status: true,
        employmentType: true,
        tenantId: true,
        accounts: credentialAccountsInclude,
      },
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if ((employee.status || "") === "INACTIVE") {
      return res.status(409).json({
        success: false,
        message: "Cannot send invitation to inactive employee",
      });
    }

    if (!employee.email) {
      return res.status(400).json({
        success: false,
        message: "Employee does not have an email address",
      });
    }

    if (hasStoredLoginCredentials(employee.password, employee.accounts)) {
      return res.status(409).json({
        success: false,
        message: "Employee already has login credentials",
      });
    }

    const pendingInvite = await prisma.invitation.findFirst({
      where: {
        email: employee.email,
        tenantId,
        status: "PENDING",
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (pendingInvite) {
      return res.status(409).json({
        success: false,
        message: "A pending invitation already exists for this employee",
      });
    }

    const token = crypto.randomBytes(32).toString("base64url");
    const expiryDate = new Date(Date.now() + 1000 * 60 * 60 * 48);

    const newInvitation = await prisma.invitation.create({
      data: {
        senderId,
        tenantId,
        email: employee.email,
        role: employee.role ?? "STAFF",
        departmentId: employee.departmentId || null,
        positionId: employee.positionId || null,
        token,
        expiresAt: expiryDate,
        dateOfBirth: employee.dateOfBirth ?? null,
        hireDate: employee.hireDate ?? null,
        employmentStatus: employee.status ?? null,
        employmentType: employee.employmentType ?? null,
      },
      include: {
        tenant: {
          select: {
            name: true,
          },
        },
      },
    });

    const clientUrl = process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : process.env.CLIENT_URL;
    const acceptLink = `${clientUrl}/accept-invite/${newInvitation.token}`;
    const tenantName = newInvitation.tenant?.name || "your organization";

    try {
      await sendInvitationEmail({
        to: newInvitation.email,
        acceptLink,
        tenantName,
        expiresAt: newInvitation.expiresAt,
      });
    } catch (emailError) {
      logger.error(
        `Setup invitation created but failed to send invitation email to ${newInvitation.email}: ${emailError.message}`,
        { stack: emailError.stack }
      );
    }

    return res.status(201).json({
      success: true,
      message: "Invitation sent successfully",
      data: {
        invitationId: newInvitation.id,
        email: newInvitation.email,
        expiresAt: newInvitation.expiresAt,
        token: newInvitation.token,
      },
    });
  } catch (error) {
    logger.error(`Error in sendSetupInvitation controller: ${error.message}`, {
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
          },
        },
        position: {
          select: {
            id: true,
            title: true,
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
      const hashedPassword = await hashPassword(password);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: existingUser.id },
          data: {
            password: hashedPassword,
            emailVerified: true,
            name: name?.trim() || existingUser.name,
          },
        });

        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED" },
        });
      });

      return res.status(200).json({
        success: true,
        message: "Account setup completed successfully. You can sign in now.",
        data: {
          user: {
            id: existingUser.id,
            email: existingUser.email,
            role: existingUser.role,
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
    }

    // Generate employee ID
    const employeeId = await generateEmployeeId(
      invitation.tenantId,
      invitation.tenant,
      invitation.department
    );

    // Find default shift for tenant (or first active shift as fallback)
    let assignedShiftId = null;

    const defaultShift = await prisma.shift.findFirst({
      where: {
        tenantId: invitation.tenantId,
        isDefault: true,
        isActive: true,
      },
    });

    if (defaultShift) {
      assignedShiftId = defaultShift.id;
      logger.info(`Assigning default shift to ${invitation.email}`);
    } else {
      // Fallback: Get first active shift
      const firstShift = await prisma.shift.findFirst({
        where: {
          tenantId: invitation.tenantId,
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (firstShift) {
        assignedShiftId = firstShift.id;
        logger.warn(
          `No default shift found, using first active shift for ${invitation.email}`
        );
      } else {
        logger.warn(
          `No active shifts found for tenant ${invitation.tenantId}, employee will be created without shift`
        );
      }
    }

    // Create user account with Prisma (no OTP; invited users are pre-verified)
    let newUser;
    try {
      const hashedPassword = await hashPassword(password);
      newUser = await prisma.user.create({
        data: {
          tenantId: invitation.tenantId,
          email: invitation.email,
          password: hashedPassword,
          name: name?.trim() || null,
          emailVerified: true,
          role: invitation.role,
          employeeId,
          departmentId: invitation.departmentId || null,
          positionId: invitation.positionId || null,
          dateOfBirth: invitation.dateOfBirth ?? null,
          status: invitation.employmentStatus ?? "ACTIVE",
          employmentType: invitation.employmentType ?? "FULL_TIME",
          hireDate: invitation.hireDate ?? null,
          shiftId: assignedShiftId || null,
        },
      });
    } catch (createError) {
      if (createError.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "User with this email already exists",
        });
      }
      logger.error(
        `Failed to create user account for invitation: ${createError.message}`,
        { stack: createError.stack }
      );
      return res.status(500).json({
        success: false,
        message: "Failed to create account. Please try again.",
      });
    }

    // Update invitation status and assign department manager if needed (using transaction)
    try {
      await prisma.$transaction(async (tx) => {
        // Update invitation status to ACCEPTED
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { status: "ACCEPTED" },
        });

        // If role is DEPARTMENT_ADMIN and departmentId exists, assign as department manager
        if (invitation.role === "DEPARTMENT_ADMIN" && invitation.departmentId) {
          // Double-check that department doesn't already have an active manager
          const department = await tx.department.findFirst({
            where: {
              id: invitation.departmentId,
              tenantId: invitation.tenantId,
              deletedAt: null,
            },
            include: {
              manager: {
                select: {
                  id: true,
                  status: true,
                  isDeleted: true,
                },
              },
            },
          });

          if (department) {
            // Only assign if no manager or existing manager is inactive/deleted
            if (
              !department.managerId ||
              department.manager?.isDeleted ||
              department.manager?.status !== "ACTIVE"
            ) {
              await tx.department.update({
                where: { id: invitation.departmentId },
                data: { managerId: newUser.id },
              });

              logger.info(
                `Assigned ${newUser.id} as manager to department ${invitation.departmentId}`
              );
            } else {
              logger.warn(
                `Department ${invitation.departmentId} already has an active manager, skipping manager assignment`
              );
            }
          }
        }
      });
    } catch (transactionError) {
      logger.error(
        `Error in transaction while accepting invitation: ${transactionError.message}`,
        { stack: transactionError.stack }
      );
      return res.status(500).json({
        success: false,
        message: "Failed to complete invitation acceptance",
      });
    }

    // Create salary structure from invitation compensation (if base salary was set)
    if (
      invitation.baseSalary != null &&
      Number(invitation.baseSalary) > 0
    ) {
      try {
        const effectiveDate =
          invitation.salaryEffectiveDate || invitation.createdAt || new Date();
        const currency =
          invitation.salaryCurrency && String(invitation.salaryCurrency).trim()
            ? String(invitation.salaryCurrency).trim()
            : "USD";
        const periodType = invitation.salaryPeriodType ?? "MONTHLY";
        await prisma.salaryStructure.create({
          data: {
            tenantId: invitation.tenantId,
            userId: newUser.id,
            baseSalary: Number(invitation.baseSalary),
            grossSalary: Number(invitation.baseSalary),
            salaryPeriodType: periodType,
            effectiveDate: new Date(effectiveDate),
            currency,
          },
        });
        logger.info(
          `Created salary structure for user ${newUser.id} from invitation (base: ${invitation.baseSalary} ${currency})`
        );
      } catch (salaryError) {
        logger.error(
          `Failed to create salary structure for user ${newUser.id}: ${salaryError.message}`,
          { stack: salaryError.stack }
        );
        // Do not fail invitation acceptance; HR can add salary structure later
      }
    }

    // Create yearly entitlement for new employee
    try {
      const companyLeavePolicy = await prisma.annualLeavePolicy.findFirst({
        where: {
          tenantId: invitation.tenantId,
        },
      });

      if (companyLeavePolicy) {
        const currentYear = new Date().getFullYear();
        const currentDate = new Date();

        // Use invitation createdAt for pro-rata calculation (hireDate might be empty)
        const invitationDate = new Date(invitation.createdAt);
        const invitationYear = invitationDate.getFullYear();

        // Calculate allocation based on accrual method
        let allocatedDays = 0;
        let accruedDays = 0;
        let yearStartDate = new Date(currentYear, 0, 1); // Jan 1
        let yearEndDate = new Date(currentYear, 11, 31); // Dec 31

        if (companyLeavePolicy.accrualMethod === "FRONT_LOADED") {
          // FRONT_LOADED: All days allocated at year start
          allocatedDays = companyLeavePolicy.defaultDaysPerYear;
          accruedDays = 0;

          // Pro-rata calculation if invited mid-year
          if (invitationYear === currentYear) {
            // Invited this year - calculate pro-rata
            const monthsRemaining = 12 - invitationDate.getMonth();
            allocatedDays =
              (companyLeavePolicy.defaultDaysPerYear / 12) * monthsRemaining;
            yearStartDate = invitationDate; // Start from invitation date
          }
        } else {
          // ACCRUAL: allocatedDays stays 0, accruedDays will grow over time
          allocatedDays = 0;
          accruedDays = 0;

          // For mid-year invites with ACCRUAL, set yearStartDate to invitation date
          if (invitationYear === currentYear) {
            yearStartDate = invitationDate;
          }
        }

        // Calculate carryover expiry date if applicable
        let carryoverExpiryDate = null;
        if (companyLeavePolicy.carryoverExpiryMonths) {
          carryoverExpiryDate = new Date(
            currentYear,
            companyLeavePolicy.carryoverExpiryMonths,
            0
          );
        }

        await prisma.yearlyEntitlement.create({
          data: {
            tenantId: invitation.tenantId,
            userId: newUser.id,
            policyId: companyLeavePolicy.id, // Required field
            year: currentYear,
            allocatedDays,
            accruedDays: 0, // Explicit
            carriedOverDays: 0, // New employee, no carryover
            adjustmentDays: 0,
            usedDays: 0,
            pendingDays: 0,
            encashedDays: 0,
            encashmentAmount: 0,
            yearStartDate,
            yearEndDate,
            lastAccrualDate: null, // Will be set when accrual runs
            carryoverExpiryDate,
          },
        });

        logger.info(
          `Created yearly entitlement for user ${newUser.id}, year ${currentYear}, allocatedDays: ${allocatedDays}`
        );
      } else {
        logger.warn(
          `No leave policy found for tenant ${invitation.tenantId}, skipping entitlement creation`
        );
        // Don't fail - entitlement can be created later via admin endpoint
      }
    } catch (entitlementError) {
      // Log error but don't fail invitation acceptance
      // Entitlement can be created later via admin endpoint
      logger.error(
        `Failed to create yearly entitlement for user ${newUser.id}: ${entitlementError.message}`,
        { stack: entitlementError.stack }
      );
      // Continue - user account is already created, entitlement is non-critical
    }
    logger.info(
      `Invitation accepted: ${invitation.email} created account for tenant ${invitation.tenantId}`
    );

    res.status(201).json({
      success: true,
      message: "Account created successfully. You can sign in with your email and password.",
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
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

    const tenantId = req.effectiveTenantId ?? req.user.tenantId;
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
    const canSeeAll =
      userRole === "HR_ADMIN" ||
      (userRole === "SUPER_ADMIN" && req.effectiveTenantId);
    if (!canSeeAll) {
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
      const validRoles = ["HR_ADMIN", "HR_STAFF", "STAFF", "DEPARTMENT_ADMIN"];
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
            },
          },
          position: {
            select: {
              id: true,
              title: true,
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
