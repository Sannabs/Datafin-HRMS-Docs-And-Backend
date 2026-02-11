-- CreateEnum
CREATE TYPE "RecentActivityType" AS ENUM ('clock_in', 'clock_out', 'approved_leave', 'rejected_leave', 'leave_submitted', 'payroll', 'attendance', 'other');

-- CreateTable
CREATE TABLE "recent_activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RecentActivityType" NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recent_activity_userId_idx" ON "recent_activity"("userId");

-- CreateIndex
CREATE INDEX "recent_activity_tenantId_idx" ON "recent_activity"("tenantId");

-- CreateIndex
CREATE INDEX "recent_activity_createdAt_idx" ON "recent_activity"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "recent_activity" ADD CONSTRAINT "recent_activity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_activity" ADD CONSTRAINT "recent_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
