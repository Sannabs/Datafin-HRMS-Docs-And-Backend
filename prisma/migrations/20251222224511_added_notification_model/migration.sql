-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PAYROLL', 'ATTENDANCE', 'LEAVE', 'PERFORMANCE', 'ACTIVITIES', 'OTHER');

-- CreateTable
CREATE TABLE "notification" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "readStatus" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_userId_idx" ON "notification"("userId");

-- CreateIndex
CREATE INDEX "notification_tenantId_idx" ON "notification"("tenantId");

-- CreateIndex
CREATE INDEX "notification_readStatus_idx" ON "notification"("readStatus");

-- CreateIndex
CREATE INDEX "notification_createdAt_idx" ON "notification"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

