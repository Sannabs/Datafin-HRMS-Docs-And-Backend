/*
  Warnings:

  - You are about to drop the column `code` on the `Department` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Department` table. All the data in the column will be lost.
  - You are about to drop the column `code` on the `Position` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Department_tenantId_code_key";

-- DropIndex
DROP INDEX "Position_tenantId_code_key";

-- AlterTable
ALTER TABLE "Department" DROP COLUMN "code",
DROP COLUMN "description";

-- AlterTable
ALTER TABLE "Position" DROP COLUMN "code";
