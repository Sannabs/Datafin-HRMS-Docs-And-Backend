-- CreateTable
CREATE TABLE "PayrollProgress" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "completedEmployees" INTEGER NOT NULL DEFAULT 0,
    "failedEmployees" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedCompletionAt" TIMESTAMP(3),
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollProgress_payrollRunId_key" ON "PayrollProgress"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollProgress_payrollRunId_idx" ON "PayrollProgress"("payrollRunId");

-- AddForeignKey
ALTER TABLE "PayrollProgress" ADD CONSTRAINT "PayrollProgress_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
