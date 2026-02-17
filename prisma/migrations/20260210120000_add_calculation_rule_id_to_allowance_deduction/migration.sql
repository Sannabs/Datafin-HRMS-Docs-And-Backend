-- AlterTable
ALTER TABLE "Allowance" ADD COLUMN IF NOT EXISTS "calculationRuleId" TEXT;

-- AlterTable
ALTER TABLE "Deduction" ADD COLUMN IF NOT EXISTS "calculationRuleId" TEXT;
