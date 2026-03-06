-- CreateEnum
CREATE TYPE "GambiaSsnFundingMode" AS ENUM ('DEDUCT_FROM_EMPLOYEE', 'EMPLOYER_PAYS_ON_BEHALF');

-- AlterTable
ALTER TABLE "Tenant"
ADD COLUMN "gambiaSsnFundingMode" "GambiaSsnFundingMode" NOT NULL DEFAULT 'DEDUCT_FROM_EMPLOYEE';

