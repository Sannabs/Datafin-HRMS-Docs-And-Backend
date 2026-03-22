-- CreateEnum
CREATE TYPE "BatchJobType" AS ENUM ('EMPLOYEE_CREATION', 'EMPLOYEE_INVITATION', 'ALLOWANCE_ALLOCATION', 'DEDUCTION_ALLOCATION', 'BULK_UPDATE');

-- CreateEnum
CREATE TYPE "BatchJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchJobRowStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "BatchJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "type" "BatchJobType" NOT NULL,
    "status" "BatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "batchCode" TEXT NOT NULL,
    "originalFilename" TEXT,
    "fileSizeBytes" INTEGER,
    "inputJson" JSONB,
    "failureReason" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "processStartedAt" TIMESTAMP(3),
    "processCompletedAt" TIMESTAMP(3),
    "queueJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchJobRow" (
    "id" TEXT NOT NULL,
    "batchJobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" "BatchJobRowStatus" NOT NULL DEFAULT 'PENDING',
    "rawPayload" JSONB,
    "errorMessage" TEXT,
    "errorField" TEXT,
    "resultEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchJobRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BatchJob_tenantId_batchCode_key" ON "BatchJob"("tenantId", "batchCode");

-- CreateIndex
CREATE INDEX "BatchJob_tenantId_status_idx" ON "BatchJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BatchJob_tenantId_createdAt_idx" ON "BatchJob"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BatchJobRow_batchJobId_rowNumber_idx" ON "BatchJobRow"("batchJobId", "rowNumber");

-- CreateIndex
CREATE INDEX "BatchJobRow_batchJobId_status_idx" ON "BatchJobRow"("batchJobId", "status");

-- AddForeignKey
ALTER TABLE "BatchJob" ADD CONSTRAINT "BatchJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchJob" ADD CONSTRAINT "BatchJob_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchJobRow" ADD CONSTRAINT "BatchJobRow_batchJobId_fkey" FOREIGN KEY ("batchJobId") REFERENCES "BatchJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
