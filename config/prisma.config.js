import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
import fs from "fs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const isProduction = process.env.NODE_ENV === "production";

const pool = new pg.Pool({
  connectionString,
  ...(isProduction && {
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync("/var/www/backend/ca-certificate.crt").toString(),
    },
  }),
});

const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ["info", "warn", "error"],
});

export default prisma;