-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "queueJobId" TEXT;

-- CreateIndex
CREATE INDEX "PayrollRun_queueJobId_idx" ON "PayrollRun"("queueJobId");
