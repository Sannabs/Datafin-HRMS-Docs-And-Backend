-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "allowPastPayPeriodCreation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN     "maxPayPeriodLookbackDays" INTEGER;
