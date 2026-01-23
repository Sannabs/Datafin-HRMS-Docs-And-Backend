-- CreateEnum
CREATE TYPE "AccrualMethod" AS ENUM ('FRONT_LOADED', 'ACCRUAL');

-- CreateEnum
CREATE TYPE "AccrualFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "CarryoverType" AS ENUM ('NONE', 'FULL', 'LIMITED', 'ENCASHMENT');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'MANAGER_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AnnualLeavePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "defaultDaysPerYear" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "accrualMethod" "AccrualMethod" NOT NULL DEFAULT 'FRONT_LOADED',
    "accrualFrequency" "AccrualFrequency",
    "accrualDaysPerPeriod" DOUBLE PRECISION,
    "carryoverType" "CarryoverType" NOT NULL DEFAULT 'NONE',
    "maxCarryoverDays" DOUBLE PRECISION,
    "carryoverExpiryMonths" INTEGER,
    "encashmentRate" DOUBLE PRECISION,
    "advanceNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualLeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "deductsFromAnnual" BOOLEAN NOT NULL DEFAULT true,
    "requiresDocument" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YearlyEntitlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "allocatedDays" DOUBLE PRECISION NOT NULL,
    "accruedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carriedOverDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustmentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pendingDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "encashedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "encashmentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yearStartDate" TIMESTAMP(3) NOT NULL,
    "yearEndDate" TIMESTAMP(3) NOT NULL,
    "lastAccrualDate" TIMESTAMP(3),
    "carryoverExpiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YearlyEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "totalDays" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "attachments" TEXT[],
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "managerId" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "hrId" TEXT,
    "hrApprovedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnualLeavePolicy_tenantId_key" ON "AnnualLeavePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "LeaveType_tenantId_isActive_idx" ON "LeaveType"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_tenantId_name_key" ON "LeaveType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "YearlyEntitlement_tenantId_userId_idx" ON "YearlyEntitlement"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "YearlyEntitlement_tenantId_year_idx" ON "YearlyEntitlement"("tenantId", "year");

-- CreateIndex
CREATE INDEX "YearlyEntitlement_userId_year_idx" ON "YearlyEntitlement"("userId", "year");

-- CreateIndex
CREATE INDEX "YearlyEntitlement_lastAccrualDate_idx" ON "YearlyEntitlement"("lastAccrualDate");

-- CreateIndex
CREATE UNIQUE INDEX "YearlyEntitlement_tenantId_userId_year_key" ON "YearlyEntitlement"("tenantId", "userId", "year");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenantId_userId_idx" ON "LeaveRequest"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "LeaveRequest_tenantId_status_idx" ON "LeaveRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_status_idx" ON "LeaveRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_managerId_status_idx" ON "LeaveRequest"("managerId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_endDate_idx" ON "LeaveRequest"("endDate");

-- AddForeignKey
ALTER TABLE "AnnualLeavePolicy" ADD CONSTRAINT "AnnualLeavePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearlyEntitlement" ADD CONSTRAINT "YearlyEntitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearlyEntitlement" ADD CONSTRAINT "YearlyEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearlyEntitlement" ADD CONSTRAINT "YearlyEntitlement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "AnnualLeavePolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_hrId_fkey" FOREIGN KEY ("hrId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_rejectedBy_fkey" FOREIGN KEY ("rejectedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
