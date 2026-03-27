-- CreateTable
CREATE TABLE "AttendanceStatSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
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
    "presentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "absentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computedBy" TEXT,

    CONSTRAINT "AttendanceStatSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceStatSnapshot_tenantId_payPeriodId_idx" ON "AttendanceStatSnapshot"("tenantId", "payPeriodId");

-- CreateIndex
CREATE INDEX "AttendanceStatSnapshot_tenantId_userId_idx" ON "AttendanceStatSnapshot"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceStatSnapshot_tenantId_userId_payPeriodId_key" ON "AttendanceStatSnapshot"("tenantId", "userId", "payPeriodId");

-- AddForeignKey
ALTER TABLE "AttendanceStatSnapshot" ADD CONSTRAINT "AttendanceStatSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceStatSnapshot" ADD CONSTRAINT "AttendanceStatSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceStatSnapshot" ADD CONSTRAINT "AttendanceStatSnapshot_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
