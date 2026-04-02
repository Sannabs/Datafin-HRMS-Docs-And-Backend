/*
  Warnings:

  - You are about to drop the column `attachments` on the `employee_warning` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "employee_warning" DROP COLUMN "attachments";

-- CreateTable
CREATE TABLE "employee_warning_attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeWarningId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_warning_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_warning_attachment_tenantId_employeeWarningId_crea_idx" ON "employee_warning_attachment"("tenantId", "employeeWarningId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "employee_warning_attachment_tenantId_mimeType_idx" ON "employee_warning_attachment"("tenantId", "mimeType");

-- AddForeignKey
ALTER TABLE "employee_warning_attachment" ADD CONSTRAINT "employee_warning_attachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning_attachment" ADD CONSTRAINT "employee_warning_attachment_employeeWarningId_fkey" FOREIGN KEY ("employeeWarningId") REFERENCES "employee_warning"("id") ON DELETE CASCADE ON UPDATE CASCADE;
