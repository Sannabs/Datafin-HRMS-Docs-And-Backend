-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT;

-- Backfill: copy existing address into addressLine1 where address is set
UPDATE "Tenant" SET "addressLine1" = "address" WHERE "address" IS NOT NULL AND "address" != '';
