/*
  Warnings:

  - Changed the type of `reasonCategory` on the `AttendanceException` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ExcusedAbsenceReasonCategory" AS ENUM ('MEDICAL', 'FAMILY_EMERGENCY', 'BEREAVEMENT', 'TRANSPORT_DISRUPTION', 'ADVERSE_WEATHER', 'PUBLIC_DUTY', 'APPROVED_LEAVE_OVERLAP', 'SYSTEM_ISSUE', 'ADMIN_CORRECTION', 'OTHER');

-- AlterTable
ALTER TABLE "AttendanceException" DROP COLUMN "reasonCategory",
ADD COLUMN     "reasonCategory" "ExcusedAbsenceReasonCategory" NOT NULL;
