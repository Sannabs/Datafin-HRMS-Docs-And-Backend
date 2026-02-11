-- AlterTable
ALTER TABLE "AllowanceType" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "DeductionType" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "AllowanceType_tenantId_isActive_idx" ON "AllowanceType"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "DeductionType_tenantId_isActive_idx" ON "DeductionType"("tenantId", "isActive");
