-- AlterTable
ALTER TABLE "AnnualLeavePolicy" ADD COLUMN     "requireManagerApproval" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "hrApprovedWithoutManager" BOOLEAN;
