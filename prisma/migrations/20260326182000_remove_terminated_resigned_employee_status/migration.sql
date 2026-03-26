-- Backfill users and invitations before enum contraction
UPDATE "User"
SET "status" = 'INACTIVE'
WHERE "status" IN ('TERMINATED', 'RESIGNED');

UPDATE "Invitation"
SET "employmentStatus" = 'INACTIVE'
WHERE "employmentStatus" IN ('TERMINATED', 'RESIGNED');

-- Replace EmployeeStatus enum values
ALTER TYPE "EmployeeStatus" RENAME TO "EmployeeStatus_old";

CREATE TYPE "EmployeeStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'ON_LEAVE');

ALTER TABLE "User"
ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status"
TYPE "EmployeeStatus"
USING ("status"::text::"EmployeeStatus");

ALTER TABLE "Invitation"
ALTER COLUMN "employmentStatus"
TYPE "EmployeeStatus"
USING ("employmentStatus"::text::"EmployeeStatus");

ALTER TABLE "User"
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "EmployeeStatus_old";
