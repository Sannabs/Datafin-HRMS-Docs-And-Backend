/*
  Warnings:

  - You are about to drop the column `positionId` on the `Invitation` table. All the data in the column will be lost.
  - You are about to drop the column `positionId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Position` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_positionId_fkey";

-- DropForeignKey
ALTER TABLE "Position" DROP CONSTRAINT "Position_departmentId_fkey";

-- DropForeignKey
ALTER TABLE "Position" DROP CONSTRAINT "Position_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_positionId_fkey";

-- DropIndex
DROP INDEX "User_tenantId_positionId_idx";

-- AlterTable
ALTER TABLE "Invitation" DROP COLUMN "positionId",
ADD COLUMN     "position" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "positionId",
ADD COLUMN     "position" TEXT;

-- DropTable
DROP TABLE "Position";
