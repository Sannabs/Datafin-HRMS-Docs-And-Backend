-- CreateEnum
CREATE TYPE "PayScheduleFrequency" AS ENUM ('SEMI_MONTHLY', 'BI_WEEKLY', 'MONTHLY', 'WEEKLY');

-- CreateTable
CREATE TABLE "PaySchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" "PayScheduleFrequency" NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaySchedule_pkey" PRIMARY KEY ("id")
);

-- DropIndex (allow multiple periods per calendar month, e.g. semi-monthly)
DROP INDEX IF EXISTS "PayPeriod_tenantId_calendarYear_calendarMonth_key";

-- AlterTable
ALTER TABLE "PayPeriod" ADD COLUMN "payScheduleId" TEXT;

-- CreateIndex
CREATE INDEX "PaySchedule_tenantId_idx" ON "PaySchedule"("tenantId");

-- CreateIndex
CREATE INDEX "PayPeriod_payScheduleId_idx" ON "PayPeriod"("payScheduleId");

-- AddForeignKey
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_payScheduleId_fkey" FOREIGN KEY ("payScheduleId") REFERENCES "PaySchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
