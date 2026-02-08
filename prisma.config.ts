import { defineConfig } from "prisma/config";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

dotenv.config();
const databaseUrl = process.env.DATABASE_URL;
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  schema: join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    path: join(__dirname, "prisma", "migrations"),
  },
  datasource: {
    url: databaseUrl as string,
  },
});