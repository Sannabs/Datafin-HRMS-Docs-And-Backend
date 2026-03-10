-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "gambiaTaxAgeExemptionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gambiaTaxExemptionAge" INTEGER;
