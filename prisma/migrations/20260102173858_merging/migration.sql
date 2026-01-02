-- AlterEnum
ALTER TYPE "EmployeeStatus" ADD VALUE 'INACTIVE';

-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "name" SET DEFAULT 'Morning Shift',
ALTER COLUMN "startTime" SET DEFAULT '09:00',
ALTER COLUMN "endTime" SET DEFAULT '17:00';
