/*
  Warnings:

  - You are about to drop the column `departmentId` on the `Position` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Position" DROP CONSTRAINT "Position_departmentId_fkey";

-- DropIndex
DROP INDEX "Position_tenantId_departmentId_idx";

-- AlterTable
ALTER TABLE "Position" DROP COLUMN "departmentId";
