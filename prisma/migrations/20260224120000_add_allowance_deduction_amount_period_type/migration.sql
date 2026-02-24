-- AlterTable
ALTER TABLE "Allowance" ADD COLUMN "amountPeriodType" "SalaryPeriodType" DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "Deduction" ADD COLUMN "amountPeriodType" "SalaryPeriodType" DEFAULT 'MONTHLY';
