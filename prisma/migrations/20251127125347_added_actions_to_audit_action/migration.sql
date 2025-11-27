-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionEnum" ADD VALUE 'TERMINATE';
ALTER TYPE "ActionEnum" ADD VALUE 'REACTIVATE';
ALTER TYPE "ActionEnum" ADD VALUE 'ADD_ALLOWANCE';
ALTER TYPE "ActionEnum" ADD VALUE 'REMOVE_ALLOWANCE';
ALTER TYPE "ActionEnum" ADD VALUE 'ADD_DEDUCTION';
ALTER TYPE "ActionEnum" ADD VALUE 'REMOVE_DEDUCTION';
ALTER TYPE "ActionEnum" ADD VALUE 'ARCHIVE';
ALTER TYPE "ActionEnum" ADD VALUE 'RESTORE';
