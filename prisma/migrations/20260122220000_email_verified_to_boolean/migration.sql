-- AlterTable: Change User.emailVerified from TIMESTAMP(3) to BOOLEAN for Better Auth compatibility.
-- Better Auth uses boolean for emailVerified; Prisma schema now matches.

-- Add new boolean column
ALTER TABLE "User" ADD COLUMN "emailVerified_new" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: users with non-null emailVerified (previously verified) -> true
UPDATE "User" SET "emailVerified_new" = ("emailVerified" IS NOT NULL);

-- Drop old column
ALTER TABLE "User" DROP COLUMN "emailVerified";

-- Rename new column
ALTER TABLE "User" RENAME COLUMN "emailVerified_new" TO "emailVerified";
