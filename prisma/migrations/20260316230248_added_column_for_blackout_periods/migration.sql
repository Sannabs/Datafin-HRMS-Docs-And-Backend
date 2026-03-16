-- AlterTable
ALTER TABLE "AnnualLeavePolicy" ADD COLUMN     "blackoutEndDay" INTEGER,
ADD COLUMN     "blackoutEndMonth" INTEGER,
ADD COLUMN     "blackoutStartDay" INTEGER,
ADD COLUMN     "blackoutStartMonth" INTEGER;
