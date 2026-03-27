-- AlterTable
ALTER TABLE "AttendanceStatSnapshot" ADD COLUMN     "expectedWorkHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "overtimeHoursRate" DOUBLE PRECISION NOT NULL DEFAULT 0;
