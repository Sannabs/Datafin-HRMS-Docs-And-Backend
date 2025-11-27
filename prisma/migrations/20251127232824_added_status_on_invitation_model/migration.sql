-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING';
