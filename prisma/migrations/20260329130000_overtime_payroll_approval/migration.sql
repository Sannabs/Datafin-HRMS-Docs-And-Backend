-- CreateEnum
CREATE TYPE "OvertimeApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "overtimePayMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5;

-- CreateTable
CREATE TABLE "OvertimePeriodApproval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "status" "OvertimeApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OvertimePeriodApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OvertimePeriodApproval_tenantId_userId_payPeriodId_key" ON "OvertimePeriodApproval"("tenantId", "userId", "payPeriodId");
CREATE INDEX "OvertimePeriodApproval_tenantId_payPeriodId_idx" ON "OvertimePeriodApproval"("tenantId", "payPeriodId");

ALTER TABLE "OvertimePeriodApproval" ADD CONSTRAINT "OvertimePeriodApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimePeriodApproval" ADD CONSTRAINT "OvertimePeriodApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimePeriodApproval" ADD CONSTRAINT "OvertimePeriodApproval_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OvertimePeriodApproval" ADD CONSTRAINT "OvertimePeriodApproval_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
