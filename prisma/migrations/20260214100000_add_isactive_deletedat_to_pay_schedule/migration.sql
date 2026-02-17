-- AlterTable
ALTER TABLE "PaySchedule" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PaySchedule" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PaySchedule_tenantId_isActive_idx" ON "PaySchedule"("tenantId", "isActive");
