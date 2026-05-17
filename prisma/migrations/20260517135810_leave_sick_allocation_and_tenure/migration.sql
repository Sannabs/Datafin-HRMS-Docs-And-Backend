-- AlterTable
ALTER TABLE "AnnualLeavePolicy" ADD COLUMN     "allocatedSickDaysPerYear" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sickLeaveAllocationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "deductsFromSickAllocation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "YearlyEntitlement" ADD COLUMN     "allocatedSickDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "pendingSickDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sickAdjustmentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "usedSickDays" DOUBLE PRECISION NOT NULL DEFAULT 0;
