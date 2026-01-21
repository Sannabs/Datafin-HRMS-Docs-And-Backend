import { auth } from "../utils/auth.js";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { generateTenantCode } from "../utils/generateTenantCode.js";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";
import {
  validateTimeFormat,
  normalizeTimeFormat,
} from "../utils/attendance.util.js";

export const tenantSignUp = async (req, res, next) => {
  try {
    const { email, password, Username, companyName, companyEmail, companyPhone } = req.body;

    if (!email || !password || !companyName || !companyEmail || !companyPhone || !Username) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "All fields are required",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
        message: "Please provide a valid email address",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Weak password",
        message: "Password must be at least 8 characters long",
      });
    }

    if (companyName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: "Invalid company name",
        message: "Company name must be at least 2 characters long",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: "Email already exists",
        message: "An account with this email already exists",
      });
    }

    const tenantCode = generateTenantCode(companyName.trim());

    const tenant = await prisma.tenant.create({
      data: {
        code: tenantCode,
        name: companyName.trim(),
        email: companyEmail.trim(),
        phone: companyPhone.trim(),

      },
    });

    logger.info(`Tenant created: ${tenant.name} (${tenant.code})`);

    const startTime = "09:00";
    const endTime = "17:00";

    try {
      validateTimeFormat(startTime);
      validateTimeFormat(endTime);
    } catch (validationError) {
      logger.error(`Time validation error: ${validationError.message}`);
      return res.status(400).json({
        success: false,
        error: "Invalid time format",
        message: validationError.message,
      });
    }

    const normalizedStartTime = normalizeTimeFormat(startTime);
    const normalizedEndTime = normalizeTimeFormat(endTime);

    const defaultShift = await prisma.shift.create({
      data: {
        name: "Morning Shift",
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        tenantId: tenant.id,
        isDefault: true,
        isActive: true,
      },
    });

    logger.info(
      `Default shift created: ${defaultShift.name} for tenant ${tenant.id}`
    );

    const employeeId = await generateEmployeeId(tenant.id, tenant.code);

    let signUpResult;
    try {
      signUpResult = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: Username.trim(),
          tenantId: tenant.id,
          role: "HR_ADMIN",
          employeeId: employeeId,
          status: "ACTIVE",
          employmentType: "FULL_TIME",
          shiftId: defaultShift.id,
        },
        headers: req.headers,
      });
    } catch (userError) {
      // Rollback: Delete shift and tenant
      await prisma.shift
        .delete({ where: { id: defaultShift.id } })
        .catch(() => { });
      await prisma.tenant.delete({ where: { id: tenant.id } });
      logger.error(
        `Failed to create user, rolled back tenant and shift: ${userError.message}`
      );
      throw userError;
    }

    if (!signUpResult?.user) {
      // Rollback: Delete shift and tenant
      await prisma.shift
        .delete({ where: { id: defaultShift.id } })
        .catch(() => { });
      await prisma.tenant.delete({ where: { id: tenant.id } });
      throw new Error("Failed to create user account");
    }

    let defaultCompanyLeavePolicy;
    try {
      defaultCompanyLeavePolicy = await prisma.annualLeavePolicy.create({
        data: {
          tenantId: tenant.id, // ✅ Fixed
          defaultDaysPerYear: 21,
          accrualMethod: "FRONT_LOADED",
          carryoverType: "FULL",
          advanceNoticeDays: 3,
        },
      });

      logger.info(`Default leave policy created for tenant ${tenant.id}`);
    } catch (error) {
      logger.error(
        `Failed to create default company leave policy: ${error.message}`
      );
      // Consider rollback or make policy creation optional
      throw error;
    }

    logger.info(`User created: ${email} for tenant ${tenant.name}`);

    return res.status(201).json({
      success: true,
      message:
        "Company account created successfully. Please check your email for verification.",
      data: {
        user: {
          id: signUpResult.user.id,
          email: signUpResult.user.email,
          role: signUpResult.user.role,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          code: tenant.code,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};


export const getMe = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
        message: "User not authenticated",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        phone: true,
        employeeId: true,
        gender: true,
        address: true,
        status: true,
        employmentType: true,
        workLocation: true,
        hireDate: true,
        emailVerified: true,
        lastLogin: true,
        isDeleted: true,
        createdAt: true,
        updatedAt: true,
        tenantId: true,
        departmentId: true,
        positionId: true,
        shiftId: true,
        tenant: {
          select: {
            id: true,
            name: true,
            code: true,
            email: true,
            phone: true,
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
        shift: {
          select: {
            id: true,
            name: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!user) {
      logger.error(`User not found: ${req.user.id}`);
      return res.status(404).json({
        success: false,
        error: "User not found",
        message: "User account does not exist",
      });
    }

    if (user.isDeleted) {
      logger.warn(`Deleted user attempted to access account: ${req.user.id}`);
      return res.status(403).json({
        success: false,
        error: "Account deactivated",
        message: "Your account has been deactivated",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: {
        user,
      },
    });
  } catch (error) {
    logger.error(`Error in getMe controller: ${error.message}`, {
      stack: error.stack,
    });
    next(error);
  }
};

