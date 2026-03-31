/*
  Warnings:

  - A unique constraint covering the columns `[salaryStructureId,allowanceTypeId]` on the table `Allowance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[salaryStructureId,deductionTypeId]` on the table `Deduction` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Allowance_salaryStructureId_allowanceTypeId_key" ON "Allowance"("salaryStructureId", "allowanceTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Deduction_salaryStructureId_deductionTypeId_key" ON "Deduction"("salaryStructureId", "deductionTypeId");
