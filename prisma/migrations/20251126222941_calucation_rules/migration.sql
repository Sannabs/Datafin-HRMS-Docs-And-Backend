-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('ALLOWANCE', 'DEDUCTION');

-- CreateTable
CREATE TABLE "CalculationRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" "RuleType" NOT NULL,
    "allowanceTypeId" TEXT,
    "deductionTypeId" TEXT,
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CalculationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalculationRule_tenantId_idx" ON "CalculationRule"("tenantId");

-- CreateIndex
CREATE INDEX "CalculationRule_tenantId_isActive_idx" ON "CalculationRule"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "CalculationRule_tenantId_ruleType_idx" ON "CalculationRule"("tenantId", "ruleType");

-- CreateIndex
CREATE INDEX "CalculationRule_allowanceTypeId_idx" ON "CalculationRule"("allowanceTypeId");

-- CreateIndex
CREATE INDEX "CalculationRule_deductionTypeId_idx" ON "CalculationRule"("deductionTypeId");

-- AddForeignKey
ALTER TABLE "CalculationRule" ADD CONSTRAINT "CalculationRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationRule" ADD CONSTRAINT "CalculationRule_allowanceTypeId_fkey" FOREIGN KEY ("allowanceTypeId") REFERENCES "AllowanceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationRule" ADD CONSTRAINT "CalculationRule_deductionTypeId_fkey" FOREIGN KEY ("deductionTypeId") REFERENCES "DeductionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
