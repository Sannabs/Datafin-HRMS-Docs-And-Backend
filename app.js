import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import logger from "./utils/logger.js";

dotenv.config();

const app = express();

// middlewares
app.use(morgan(process.env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const allowedOrigins = ["http://localhost:3000", process.env.CLIENT_URL];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, origin);

      if (allowedOrigins.indexOf(origin) !== -1) {
        logger.info(`✅Allowed by CORS: ${origin}`);
        callback(null, origin);
      } else {
        logger.warn(`❌Not allowed by CORS: ${origin}`);
        callback(new Error(`❌Not allowed by CORS: ${origin}`));
      }
    },
    credentials: true,
  })
);
app.use(cookieParser());

export default app;
