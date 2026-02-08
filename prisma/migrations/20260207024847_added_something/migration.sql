-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "allowedClockInMethods" SET DEFAULT ARRAY['GPS', 'QR_CODE']::"ClockMethod"[];
