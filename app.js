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
import payrollRunRoutes from "./routes/payroll-run.route.js";
import payslipRoutes from "./routes/payslip.route.js";

dotenv.config();

const app = express();

app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedOrigins = ["http://localhost:3000", process.env.CLIENT_URL];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, origin);

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

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/allowance-types", allowanceTypeRoutes);
app.use("/api/deduction-types", deductionTypeRoutes);
app.use("/api/salary-structures", salaryStructureRoutes);
app.use("/api/calculation-rules", calculationRuleRoutes);
app.use("/api/invitations", invitationRoutes);
app.use("/api/pay-periods", payPeriodRoutes);
app.use("/api/payroll-runs", payrollRunRoutes);
app.use("/api/payslips", payslipRoutes);

app.all("/api/auth/*", toNodeHandler(auth));

app.use(errorHandler);

export default app;
