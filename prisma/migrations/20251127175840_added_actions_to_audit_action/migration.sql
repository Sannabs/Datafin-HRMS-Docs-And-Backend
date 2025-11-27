-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionEnum" ADD VALUE 'START_PAYROLL_RUN';
ALTER TYPE "ActionEnum" ADD VALUE 'PROCESS';
ALTER TYPE "ActionEnum" ADD VALUE 'PAUSE';
ALTER TYPE "ActionEnum" ADD VALUE 'RESUME';
