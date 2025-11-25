import { auth } from "../utils/auth.js";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { generateTenantCode } from "../utils/generateTenantCode.js";
import { generateEmployeeId } from "../utils/generateEmployeeId.js";

export const tenantSignUp = async (req, res, next) => {
  try {
    const { email, password, companyName } = req.body;

    if (!email || !password || !companyName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "Email, password, and company name are required",
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
      },
    });

    logger.info(`Tenant created: ${tenant.name} (${tenant.code})`);

    const employeeId = await generateEmployeeId(tenant.id, tenant.code);

    let signUpResult;
    try {
      signUpResult = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: null,
          tenantId: tenant.id,
          role: "HR_ADMIN",
          employeeId: employeeId,
          status: "ACTIVE",
          employmentType: "FULL_TIME",
        },
        headers: req.headers,
      });
    } catch (userError) {
      await prisma.tenant.delete({
        where: { id: tenant.id },
      });
      logger.error(
        `Failed to create user, rolled back tenant: ${userError.message}`
      );
      throw userError;
    }

    if (!signUpResult?.user) {
      await prisma.tenant.delete({
        where: { id: tenant.id },
      });
      throw new Error("Failed to create user account");
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

export const userLogin = async (req, res, next) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "Email and password are required",
      });
    }

    const loginResult = await auth.api.signInEmail({
      body: {
        email,
        password,
        rememberMe: rememberMe || false,
      },
      headers: req.headers,
    });

    if (!loginResult?.user) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
        message: "Invalid email or password",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: loginResult.user.id,
      },
    });

    if (!user || user.isDeleted) {
      return res.status(401).json({
        success: false,
        error: "Account not found",
        message: "Your account has been deactivated or does not exist",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    logger.info(`User logged in: ${email}`);

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: loginResult.user.id,
          email: loginResult.user.email,
          name: loginResult.user.name,
          role: user.role,
        },
        session: loginResult.session,
      },
    });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);

    if (
      error.message?.includes("Invalid credentials") ||
      error.message?.includes("invalid") ||
      error.message?.includes("password") ||
      error.message?.includes("email")
    ) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
        message: "Invalid email or password",
      });
    }

    if (
      error.message?.includes("email not verified") ||
      error.message?.includes("verification")
    ) {
      return res.status(403).json({
        success: false,
        error: "Email not verified",
        message: "Please verify your email before logging in",
      });
    }

    next(error);
  }
};

export const userLogout = async (req, res, next) => {
  try {
    await auth.api.signOut({
      headers: req.headers,
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    logger.error(`Logout error: ${error.message}`);
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "Email is required",
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

    await auth.api.forgotPassword({
      body: {
        email,
      },
      headers: req.headers,
    });

    return res.status(200).json({
      success: true,
      message: "Password reset email sent. Please check your inbox.",
    });
  } catch (error) {
    logger.error(`Forgot password error: ${error.message}`);

    if (
      error.message?.includes("not found") ||
      error.message?.includes("user")
    ) {
      return res.status(404).json({
        success: false,
        error: "User not found",
        message: "No account found with this email address",
      });
    }

    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "Token is required",
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "New password is required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Weak password",
        message: "Password must be at least 8 characters long",
      });
    }

    await auth.api.resetPassword({
      body: {
        token,
        password: newPassword,
      },
      headers: req.headers,
    });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    logger.error(`Reset password error: ${error.message}`);

    if (
      error.message?.includes("invalid") ||
      error.message?.includes("expired") ||
      error.message?.includes("token")
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid or expired token",
        message:
          "The reset token is invalid or has expired. Please request a new one.",
      });
    }

    next(error);
  }
};
