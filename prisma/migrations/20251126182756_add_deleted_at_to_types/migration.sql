-- AlterTable
ALTER TABLE "AllowanceType" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DeductionType" ADD COLUMN     "deletedAt" TIMESTAMP(3);
