import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import logger from "./utils/logger.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { auth } from "./utils/auth.js";
import { toNodeHandler } from "better-auth/node";
import authRoutes from "./routes/auth.routes.js";
import employeeRoutes from "./routes/employee.route.js";
import allowanceTypeRoutes from "./routes/allowance-type.route.js";
import deductionTypeRoutes from "./routes/deduction-type.route.js";
import salaryStructureRoutes from "./routes/salary-structure.route.js";
import calculationRuleRoutes from "./routes/calculation-rule.route.js";
import invitationRoutes from "./routes/invitation.route.js";
import payPeriodRoutes from "./routes/pay-period.route.js";
import payScheduleRoutes from "./routes/pay-schedule.route.js";
import payrollRunRoutes from "./routes/payroll-run.route.js";
import auditRoutes from "./routes/audit.route.js";
import payslipRoutes from "./routes/payslip.route.js";
import holidayRoutes from "./routes/holiday.route.js";
import notificationRoutes from "./routes/notification.route.js";
import attendanceRoutes from "./routes/attendance.route.js";
import leaveRoutes from "./routes/leave.route.js";
import departmentRoutes from "./routes/department.route.js";
import positionRoutes from "./routes/position.route.js";
import tenantRoutes from "./routes/tenant.route.js";
dotenv.config();

// BullMQ is optional during development
// Set ENABLE_BULLMQ_QUEUE=true in .env to enable queue-based processing
const ENABLE_BULLMQ = process.env.ENABLE_BULLMQ_QUEUE === "true";

const app = express();

app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS: browser requests send Origin; native mobile (Expo iOS/Android) typically do not.
// When origin is undefined we allow the request (mobile app). For web, only listed origins are allowed.
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:8081", // Expo web dev server
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow mobile app (no Origin header)

      if (allowedOrigins.indexOf(origin) !== -1) {
        logger.info(`Allowed by CORS: ${origin}`);
        callback(null, origin);
      } else {
        logger.warn(`Not allowed by CORS: ${origin}`);
        callback(new Error(`Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(cookieParser());

// Log every request to /api/auth so mobile app auth calls are visible
app.use("/api/auth", (req, res, next) => {
  logger.info(`[Auth] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/allowance-types", allowanceTypeRoutes);
app.use("/api/deduction-types", deductionTypeRoutes);
app.use("/api/salary-structures", salaryStructureRoutes);
app.use("/api/calculation-rules", calculationRuleRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/pay-periods", payPeriodRoutes);
app.use("/api/pay-schedules", payScheduleRoutes);
app.use("/api/payroll-runs", payrollRunRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/payslips", payslipRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/positions", positionRoutes);
app.use("/api/tenant", tenantRoutes);
app.all("/api/auth/*", toNodeHandler(auth));
app.use("/api/attendance", attendanceRoutes);
app.use("/api/leave", leaveRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    bullmqEnabled: ENABLE_BULLMQ,
  });
});

app.use(errorHandler);

export default app;
