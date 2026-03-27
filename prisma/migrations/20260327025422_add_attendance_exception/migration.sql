-- CreateEnum
CREATE TYPE "AttendanceExceptionType" AS ENUM ('EXCUSED_ABSENCE');

-- CreateTable
CREATE TABLE "AttendanceException" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "AttendanceExceptionType" NOT NULL DEFAULT 'EXCUSED_ABSENCE',
    "reasonCategory" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "clearedAt" TIMESTAMP(3),
    "clearReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceException_tenantId_userId_date_idx" ON "AttendanceException"("tenantId", "userId", "date");

-- CreateIndex
CREATE INDEX "AttendanceException_tenantId_date_type_isActive_idx" ON "AttendanceException"("tenantId", "date", "type", "isActive");

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceException" ADD CONSTRAINT "AttendanceException_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
