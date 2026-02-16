-- DropForeignKey (Payslip.originalPayslipId -> Payslip.id)
ALTER TABLE "Payslip" DROP CONSTRAINT IF EXISTS "Payslip_originalPayslipId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Payslip_originalPayslipId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Payslip_isAdjustment_idx";

-- AlterTable: remove adjustment and snapshot columns from Payslip
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "originalPayslipId";
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "adjustmentReason";
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "adjustmentType";
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "isAdjustment";
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "previousGrossSalary";
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "previousNetSalary";
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "previousTotalAllowances";
ALTER TABLE "Payslip" DROP COLUMN IF EXISTS "previousTotalDeductions";

-- DropEnum
DROP TYPE IF EXISTS "AdjustmentType";
