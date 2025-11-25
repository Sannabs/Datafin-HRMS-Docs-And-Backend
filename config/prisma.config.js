import { PrismaClient } from "../prisma/generated/prisma/index.js";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
  log: ["query", "info", "warn", "error"],
});

export default prisma;
