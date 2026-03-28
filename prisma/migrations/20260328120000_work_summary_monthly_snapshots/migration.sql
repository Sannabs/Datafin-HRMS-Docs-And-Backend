-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "timezone" TEXT;

-- CreateTable
CREATE TABLE "MonthlyAttendanceStatSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "calendarYear" INTEGER NOT NULL,
    "calendarMonth" INTEGER NOT NULL,
    "periodStartDate" TIMESTAMP(3) NOT NULL,
    "periodEndDate" TIMESTAMP(3) NOT NULL,
    "expectedWorkdays" INTEGER NOT NULL DEFAULT 0,
    "effectiveExpectedWorkdays" INTEGER NOT NULL DEFAULT 0,
    "observedAttendanceDays" INTEGER NOT NULL DEFAULT 0,
    "presentCount" INTEGER NOT NULL DEFAULT 0,
    "lateCount" INTEGER NOT NULL DEFAULT 0,
    "absentCount" INTEGER NOT NULL DEFAULT 0,
    "excusedAbsenceCount" INTEGER NOT NULL DEFAULT 0,
    "overtimeDaysCount" INTEGER NOT NULL DEFAULT 0,
    "overtimeHoursTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedWorkHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "presentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "absentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHoursRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computedBy" TEXT,

    CONSTRAINT "MonthlyAttendanceStatSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyAttendanceStatSnapshot_tenantId_userId_calendarYear_calendarMonth_key" ON "MonthlyAttendanceStatSnapshot"("tenantId", "userId", "calendarYear", "calendarMonth");

CREATE INDEX "MonthlyAttendanceStatSnapshot_tenantId_userId_idx" ON "MonthlyAttendanceStatSnapshot"("tenantId", "userId");

ALTER TABLE "MonthlyAttendanceStatSnapshot" ADD CONSTRAINT "MonthlyAttendanceStatSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MonthlyAttendanceStatSnapshot" ADD CONSTRAINT "MonthlyAttendanceStatSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
