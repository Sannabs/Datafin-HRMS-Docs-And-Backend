-- CreateTable
CREATE TABLE "SshfcRemittanceDocument" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filePath" TEXT NOT NULL,

    CONSTRAINT "SshfcRemittanceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SshfcRemittanceDocument_payrollRunId_key" ON "SshfcRemittanceDocument"("payrollRunId");

-- CreateIndex
CREATE INDEX "SshfcRemittanceDocument_tenantId_idx" ON "SshfcRemittanceDocument"("tenantId");

-- AddForeignKey
ALTER TABLE "SshfcRemittanceDocument" ADD CONSTRAINT "SshfcRemittanceDocument_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SshfcRemittanceDocument" ADD CONSTRAINT "SshfcRemittanceDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
