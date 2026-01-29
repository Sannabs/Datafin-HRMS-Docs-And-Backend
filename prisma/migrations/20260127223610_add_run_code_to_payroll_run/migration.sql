/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,runCode]` on the table `PayrollRun` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "runCode" TEXT;

-- CreateIndex
CREATE INDEX "PayrollRun_runCode_idx" ON "PayrollRun"("runCode");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_tenantId_runCode_key" ON "PayrollRun"("tenantId", "runCode");
