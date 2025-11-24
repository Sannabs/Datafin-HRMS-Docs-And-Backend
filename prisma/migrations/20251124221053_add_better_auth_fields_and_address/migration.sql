-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('HR_ADMIN', 'HR_STAFF', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'TERMINATED', 'RESIGNED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "CalculationMethod" AS ENUM ('FIXED', 'PERCENTAGE', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('DRAFT', 'PROCESSING', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "managerId" TEXT,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "departmentId" TEXT,
    "positionId" TEXT,
    "createdBy" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "lastLogin" TIMESTAMP(3),
    "employeeId" TEXT NOT NULL,
    "gender" "Gender" DEFAULT 'PREFER_NOT_TO_SAY',
    "phone" TEXT,
    "hireDate" TIMESTAMP(3),
    "address" TEXT,
    "status" "EmployeeStatus" DEFAULT 'ACTIVE',
    "employmentType" "EmploymentType" DEFAULT 'FULL_TIME',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryStructure" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllowanceType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AllowanceType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allowance" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "allowanceTypeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculationMethod" "CalculationMethod" NOT NULL DEFAULT 'FIXED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Allowance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeductionType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeductionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deduction" (
    "id" TEXT NOT NULL,
    "salaryStructureId" TEXT NOT NULL,
    "deductionTypeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculationMethod" "CalculationMethod" NOT NULL DEFAULT 'FIXED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "calendarMonth" INTEGER NOT NULL,
    "calendarYear" INTEGER NOT NULL,
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalGrossPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalNetPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payslip" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grossSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAllowances" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "filePath" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_code_key" ON "Tenant"("code");

-- CreateIndex
CREATE INDEX "Department_tenantId_idx" ON "Department"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_name_key" ON "Department"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Position_tenantId_idx" ON "Position"("tenantId");

-- CreateIndex
CREATE INDEX "Position_tenantId_departmentId_idx" ON "Position"("tenantId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_tenantId_title_key" ON "Position"("tenantId", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Position_tenantId_code_key" ON "Position"("tenantId", "code");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_tenantId_departmentId_idx" ON "User"("tenantId", "departmentId");

-- CreateIndex
CREATE INDEX "User_tenantId_positionId_idx" ON "User"("tenantId", "positionId");

-- CreateIndex
CREATE INDEX "User_tenantId_status_idx" ON "User"("tenantId", "status");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isDeleted_idx" ON "User"("isDeleted");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_employeeId_key" ON "User"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "SalaryStructure_tenantId_idx" ON "SalaryStructure"("tenantId");

-- CreateIndex
CREATE INDEX "SalaryStructure_tenantId_userId_idx" ON "SalaryStructure"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "SalaryStructure_userId_effectiveDate_idx" ON "SalaryStructure"("userId", "effectiveDate");

-- CreateIndex
CREATE INDEX "AllowanceType_tenantId_idx" ON "AllowanceType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceType_tenantId_name_key" ON "AllowanceType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AllowanceType_tenantId_code_key" ON "AllowanceType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Allowance_salaryStructureId_idx" ON "Allowance"("salaryStructureId");

-- CreateIndex
CREATE INDEX "Allowance_allowanceTypeId_idx" ON "Allowance"("allowanceTypeId");

-- CreateIndex
CREATE INDEX "DeductionType_tenantId_idx" ON "DeductionType"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DeductionType_tenantId_name_key" ON "DeductionType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DeductionType_tenantId_code_key" ON "DeductionType"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Deduction_salaryStructureId_idx" ON "Deduction"("salaryStructureId");

-- CreateIndex
CREATE INDEX "Deduction_deductionTypeId_idx" ON "Deduction"("deductionTypeId");

-- CreateIndex
CREATE INDEX "PayPeriod_tenantId_idx" ON "PayPeriod"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PayPeriod_tenantId_periodName_key" ON "PayPeriod"("tenantId", "periodName");

-- CreateIndex
CREATE UNIQUE INDEX "PayPeriod_tenantId_calendarYear_calendarMonth_key" ON "PayPeriod"("tenantId", "calendarYear", "calendarMonth");

-- CreateIndex
CREATE INDEX "PayrollRun_tenantId_idx" ON "PayrollRun"("tenantId");

-- CreateIndex
CREATE INDEX "PayrollRun_tenantId_payPeriodId_idx" ON "PayrollRun"("tenantId", "payPeriodId");

-- CreateIndex
CREATE INDEX "PayrollRun_status_runDate_idx" ON "PayrollRun"("status", "runDate");

-- CreateIndex
CREATE INDEX "Payslip_payrollRunId_idx" ON "Payslip"("payrollRunId");

-- CreateIndex
CREATE INDEX "Payslip_userId_idx" ON "Payslip"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Payslip_payrollRunId_userId_key" ON "Payslip"("payrollRunId", "userId");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryStructure" ADD CONSTRAINT "SalaryStructure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllowanceType" ADD CONSTRAINT "AllowanceType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "SalaryStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allowance" ADD CONSTRAINT "Allowance_allowanceTypeId_fkey" FOREIGN KEY ("allowanceTypeId") REFERENCES "AllowanceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeductionType" ADD CONSTRAINT "DeductionType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deduction" ADD CONSTRAINT "Deduction_salaryStructureId_fkey" FOREIGN KEY ("salaryStructureId") REFERENCES "SalaryStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deduction" ADD CONSTRAINT "Deduction_deductionTypeId_fkey" FOREIGN KEY ("deductionTypeId") REFERENCES "DeductionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayPeriod" ADD CONSTRAINT "PayPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payslip" ADD CONSTRAINT "Payslip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
