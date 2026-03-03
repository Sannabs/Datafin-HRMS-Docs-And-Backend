-- Create TenantStatus enum and add status column to Tenant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'TenantStatus'
  ) THEN
    CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
  END IF;
END$$;

ALTER TABLE "Tenant"
ADD COLUMN IF NOT EXISTS "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

