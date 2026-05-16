/*
  Warnings:

  - You are about to drop the column `encashmentWorkingDays` on the `AnnualLeavePolicy` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AnnualLeavePolicy" DROP COLUMN "encashmentWorkingDays";

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "logo" TEXT;
