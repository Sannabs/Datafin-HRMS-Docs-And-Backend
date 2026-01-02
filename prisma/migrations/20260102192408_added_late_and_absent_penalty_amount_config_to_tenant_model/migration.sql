-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "absencePenalty" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "consecutiveLatePenalty" DOUBLE PRECISION DEFAULT 0;
