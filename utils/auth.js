import { betterAuth } from "better-auth";
import prisma from "../config/prisma.config.js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { sendVerificationOTP as sendOTPEmail } from "../views/sendVerificationEmail.js";
import { sendPasswordResetEmail } from "../views/sendPasswordResetEmail.js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    modelName: "User",
    fields: {
      email: "email",
      name: "name",
      image: "image",
      emailVerified: "emailVerified",
      password: "password",
    },
    // When adding new fields to the User model:
    // 1. Add field to prisma/schema.prisma
    // 2. Run: npx prisma migrate dev --name add_field_name
    // 3. Run: npx prisma generate
    // 4. Add field here in additionalFields (if you want Better Auth to recognize it)
    additionalFields: {
      tenantId: {
        type: "string",
        required: true,
      },
      departmentId: {
        type: "string",
        required: false,
      },
      positionId: {
        type: "string",
        required: false,
      },
      createdBy: {
        type: "string",
        required: false,
      },
      address: {
        type: "string",
        required: false,
      },
      role: {
        type: "string",
        required: false,
      },
      isDeleted: {
        type: "boolean",
        required: false,
      },
      lastLogin: {
        type: "date",
        required: false,
      },
      employeeId: {
        type: "string",
        required: true,
      },
      gender: {
        type: "string",
        required: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      hireDate: {
        type: "date",
        required: false,
      },
      status: {
        type: "string",
        required: false,
      },
      employmentType: {
        type: "string",
        required: false,
      },
      deletedAt: {
        type: "date",
        required: false,
      },

      shiftId: {
        type: "string",
        required: false,
      },
    },
  },
  advanced: {
    disableCSRFCheck: process.env.NODE_ENV === "development",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url, token }) => {
      // Generate custom reset URL with token as path parameter
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      const customResetUrl = `${clientUrl}/reset-password/${token}`;
      
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl: customResetUrl,
        token: token,
        userName: user.name || user.email,
      });
    },
    resetPasswordTokenExpiresIn: 3600, // 1 hour in seconds
    resetPasswordCallbackURL: process.env.CLIENT_URL || "http://localhost:3000",
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp }) {
        // Send OTP via email
        await sendOTPEmail({
          to: email,
          otp: otp,
        });
      },
      otpLength: 6,
      expiresIn: 300, // 5 minutes in seconds
      allowedAttempts: 3,
    }),
  ],
});
