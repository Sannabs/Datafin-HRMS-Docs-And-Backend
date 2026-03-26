-- CreateEnum
CREATE TYPE "TerminationReason" AS ENUM ('FIRED', 'RESIGNED');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "terminationReason" "TerminationReason";
