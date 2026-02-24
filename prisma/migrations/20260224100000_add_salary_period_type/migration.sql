-- CreateEnum
CREATE TYPE "SalaryPeriodType" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "salaryPeriodType" "SalaryPeriodType" DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "SalaryStructure" ADD COLUMN "salaryPeriodType" "SalaryPeriodType" NOT NULL DEFAULT 'MONTHLY';
