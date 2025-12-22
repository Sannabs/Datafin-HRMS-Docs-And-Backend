-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('PUBLIC', 'COMPANY', 'REGIONAL', 'RELIGIOUS', 'OPTIONAL');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "weekendDays" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[];

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "HolidayType" NOT NULL DEFAULT 'PUBLIC',
    "description" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "year" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Holiday_tenantId_date_idx" ON "Holiday"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Holiday_tenantId_year_idx" ON "Holiday"("tenantId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_tenantId_date_name_key" ON "Holiday"("tenantId", "date", "name");

-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
