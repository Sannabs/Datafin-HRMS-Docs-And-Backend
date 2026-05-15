-- CreateTable
CREATE TABLE "GraPayeScheduleDocument" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filePath" TEXT NOT NULL,

    CONSTRAINT "GraPayeScheduleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GraPayeScheduleDocument_payrollRunId_key" ON "GraPayeScheduleDocument"("payrollRunId");

-- CreateIndex
CREATE INDEX "GraPayeScheduleDocument_tenantId_idx" ON "GraPayeScheduleDocument"("tenantId");

-- AddForeignKey
ALTER TABLE "GraPayeScheduleDocument" ADD CONSTRAINT "GraPayeScheduleDocument_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraPayeScheduleDocument" ADD CONSTRAINT "GraPayeScheduleDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
