-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "gambiaStatutoryEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "employerSocialSecurityRate" DOUBLE PRECISION;
