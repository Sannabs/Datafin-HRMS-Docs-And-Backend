import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: ["info", "warn", "error"],
});

export default prisma;
