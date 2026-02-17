-- AlterTable
ALTER TABLE "AllowanceType" ADD COLUMN     "defaultCalculationMethod" "CalculationMethod",
ADD COLUMN     "defaultAmount" DOUBLE PRECISION,
ADD COLUMN     "defaultCalculationRuleId" TEXT;

-- AlterTable
ALTER TABLE "DeductionType" ADD COLUMN     "defaultCalculationMethod" "CalculationMethod",
ADD COLUMN     "defaultAmount" DOUBLE PRECISION,
ADD COLUMN     "defaultCalculationRuleId" TEXT;
