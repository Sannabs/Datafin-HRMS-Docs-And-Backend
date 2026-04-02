-- CreateEnum
CREATE TYPE "EmployeeWarningCategory" AS ENUM ('ATTENDANCE', 'CONDUCT', 'PERFORMANCE', 'COMPLIANCE', 'SAFETY');

-- CreateEnum
CREATE TYPE "EmployeeWarningSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'FINAL');

-- CreateEnum
CREATE TYPE "EmployeeWarningStatus" AS ENUM ('DRAFT', 'PENDING_HR_REVIEW', 'ISSUED', 'ACKNOWLEDGED', 'APPEAL_OPEN', 'APPEAL_REVIEW', 'APPEAL_UPHELD', 'APPEAL_AMENDED', 'APPEAL_VOIDED', 'RESOLVED', 'ESCALATED', 'VOIDED');

-- CreateTable
CREATE TABLE "employee_warning" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "EmployeeWarningStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "category" "EmployeeWarningCategory" NOT NULL,
    "severity" "EmployeeWarningSeverity" NOT NULL,
    "incidentDate" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "policyReference" TEXT,
    "attachments" JSONB,
    "reviewNote" TEXT,
    "issueNote" TEXT,
    "reviewDueDate" DATE,
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_warning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_warning_tenantId_userId_idx" ON "employee_warning"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "employee_warning_tenantId_status_idx" ON "employee_warning"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
