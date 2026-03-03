import { betterAuth } from "better-auth";
import prisma from "../config/prisma.config.js";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { sendVerificationOTP as sendOTPEmail } from "../views/sendVerificationEmail.js";
import { sendPasswordResetEmail } from "../views/sendPasswordResetEmail.js";

const isProd = process.env.NODE_ENV === "production";
const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:5000";
const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

export const auth = betterAuth({
  baseURL,
  trustedOrigins: [clientUrl, baseURL],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          if (session?.userId) {
            await prisma.user.update({
              where: { id: session.userId },
              data: { lastLogin: new Date() },
            });
          }
        },
      },
    },
  },
  user: {
    modelName: "User",
    fields: {
      email: "email",
      name: "name",
      image: "image",
      emailVerified: "emailVerified",
      password: "password",
    },
    additionalFields: {
      tenantId: { type: "string", required: true },
      departmentId: { type: "string", required: false },
      positionId: { type: "string", required: false },
      createdBy: { type: "string", required: false },
      address: { type: "string", required: false },
      role: { type: "string", required: false },
      isDeleted: { type: "boolean", required: false },
      lastLogin: { type: "date", required: false },
      employeeId: { type: "string", required: true },
      gender: { type: "string", required: false },
      phone: { type: "string", required: false },
      hireDate: { type: "date", required: false },
      status: { type: "string", required: false },
      employmentType: { type: "string", required: false },
      deletedAt: { type: "date", required: false },
      shiftId: { type: "string", required: false },
    },
  },
  advanced: {
    disableCSRFCheck: process.env.NODE_ENV === "development",
    useSecureCookies: isProd,
    trustedProxyHeaders: true,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url, token }) => {
      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";
      const customResetUrl = `${clientUrl}/reset-password/${token}`;
      await sendPasswordResetEmail({
        to: user.email,
        resetUrl: customResetUrl,
        token: token,
        userName: user.name || user.email,
      });
    },
    resetPasswordTokenExpiresIn: 3600,
    resetPasswordCallbackURL: process.env.CLIENT_URL || "http://localhost:3000",
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp }) {
        await sendOTPEmail({ to: email, otp });
      },
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
    }),
  ],
});