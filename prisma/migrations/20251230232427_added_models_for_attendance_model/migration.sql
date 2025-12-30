-- CreateEnum
CREATE TYPE "WorkLocation" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('CORRECTION', 'SUPPLEMENT', 'REVERSAL', 'AMENDMENT');

-- CreateEnum
CREATE TYPE "ClockMethod" AS ENUM ('GPS', 'WIFI', 'QR_CODE', 'PHOTO');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ON_TIME', 'LATE', 'EARLY', 'ABSENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionEnum" ADD VALUE 'DOWNLOAD';
ALTER TYPE "ActionEnum" ADD VALUE 'EXPORT';
ALTER TYPE "ActionEnum" ADD VALUE 'DISTRIBUTE';

-- DropIndex
DROP INDEX "Payslip_payrollRunId_userId_key";

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "adjustmentReason" TEXT,
ADD COLUMN     "adjustmentType" "AdjustmentType",
ADD COLUMN     "hasWarnings" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAdjustment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "originalPayslipId" TEXT,
ADD COLUMN     "previousGrossSalary" DOUBLE PRECISION,
ADD COLUMN     "previousNetSalary" DOUBLE PRECISION,
ADD COLUMN     "previousTotalAllowances" DOUBLE PRECISION,
ADD COLUMN     "previousTotalDeductions" DOUBLE PRECISION,
ADD COLUMN     "warnings" JSONB;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "allowedClockInMethods" "ClockMethod"[],
ADD COLUMN     "earlyClockInMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "geofenceRadius" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "requirePhoto" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "shiftId" TEXT,
ADD COLUMN     "workLocation" "WorkLocation";

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "locationId" TEXT,
    "clockInTime" TIMESTAMP(3) NOT NULL,
    "clockOutTime" TIMESTAMP(3),
    "totalHours" DOUBLE PRECISION,
    "overtimeHours" DOUBLE PRECISION DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'ON_TIME',
    "clockInMethod" "ClockMethod" NOT NULL,
    "clockInPhotoUrl" TEXT,
    "clockInDeviceInfo" TEXT,
    "clockInIpAddress" TEXT,
    "clockOutMethod" "ClockMethod",
    "clockOutPhotoUrl" TEXT,
    "clockOutDeviceInfo" TEXT,
    "clockOutIpAddress" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkConfig" (
    "id" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL DEFAULT true,
    "tuesday" BOOLEAN NOT NULL DEFAULT true,
    "wednesday" BOOLEAN NOT NULL DEFAULT true,
    "thursday" BOOLEAN NOT NULL DEFAULT true,
    "friday" BOOLEAN NOT NULL DEFAULT true,
    "saturday" BOOLEAN NOT NULL DEFAULT false,
    "sunday" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWorkConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyWorkDay" (
    "id" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL DEFAULT true,
    "tuesday" BOOLEAN NOT NULL DEFAULT true,
    "wednesday" BOOLEAN NOT NULL DEFAULT true,
    "thursday" BOOLEAN NOT NULL DEFAULT true,
    "friday" BOOLEAN NOT NULL DEFAULT true,
    "saturday" BOOLEAN NOT NULL DEFAULT false,
    "sunday" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyWorkDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "wifiSSID" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attendance_userId_clockInTime_idx" ON "Attendance"("userId", "clockInTime");

-- CreateIndex
CREATE INDEX "Attendance_tenantId_clockInTime_idx" ON "Attendance"("tenantId", "clockInTime");

-- CreateIndex
CREATE INDEX "Attendance_locationId_idx" ON "Attendance"("locationId");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWorkConfig_userId_key" ON "EmployeeWorkConfig"("userId");

-- CreateIndex
CREATE INDEX "EmployeeWorkConfig_userId_idx" ON "EmployeeWorkConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyWorkDay_tenantId_key" ON "CompanyWorkDay"("tenantId");

-- CreateIndex
CREATE INDEX "Shift_tenantId_idx" ON "Shift"("tenantId");

-- CreateIndex
CREATE INDEX "Shift_isDefault_idx" ON "Shift"("isDefault");

-- CreateIndex
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

-- CreateIndex
CREATE INDEX "Payslip_payrollRunId_userId_idx" ON "Payslip"("payrollRunId", "userId");

-- CreateIndex
CREATE INDEX "Payslip_isAdjustment_idx" ON "Payslip"("isAdjustment");

-- CreateIndex
CREATE INDEX "Payslip_originalPayslipId_idx" ON "Payslip"("originalPayslipId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_originalPayslipId_fkey" FOREIGN KEY ("originalPayslipId") REFERENCES "Payslip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkConfig" ADD CONSTRAINT "EmployeeWorkConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyWorkDay" ADD CONSTRAINT "CompanyWorkDay_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
