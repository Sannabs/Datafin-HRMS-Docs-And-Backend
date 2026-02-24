-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "hireDate" TIMESTAMP(3);
ALTER TABLE "Invitation" ADD COLUMN     "employmentStatus" "EmployeeStatus";
ALTER TABLE "Invitation" ADD COLUMN     "employmentType" "EmploymentType";
ALTER TABLE "Invitation" ADD COLUMN     "baseSalary" DOUBLE PRECISION;
ALTER TABLE "Invitation" ADD COLUMN     "salaryEffectiveDate" TIMESTAMP(3);
ALTER TABLE "Invitation" ADD COLUMN     "salaryCurrency" TEXT DEFAULT 'USD';
