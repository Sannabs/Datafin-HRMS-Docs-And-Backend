-- CreateEnum
CREATE TYPE "PatrolSessionStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'INCOMPLETE', 'MISSED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PATROL';

-- CreateTable
CREATE TABLE "PatrolSite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PatrolSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolCheckpoint" (
    "id" TEXT NOT NULL,
    "patrolSiteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patrolSiteId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intervalHours" INTEGER NOT NULL DEFAULT 2,
    "windowStartTime" TEXT NOT NULL DEFAULT '08:00',
    "windowEndTime" TEXT NOT NULL DEFAULT '20:00',
    "requireAllPoints" BOOLEAN NOT NULL DEFAULT true,
    "minCheckpoints" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "PatrolSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolSession" (
    "id" TEXT NOT NULL,
    "patrolScheduleId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "slotStart" TIMESTAMP(3) NOT NULL,
    "slotEnd" TIMESTAMP(3) NOT NULL,
    "status" "PatrolSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "checkpointsHit" INTEGER NOT NULL DEFAULT 0,
    "checkpointsTotal" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatrolSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatrolScanEvent" (
    "id" TEXT NOT NULL,
    "patrolSessionId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "scannedByUserId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "PatrolScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatrolSite_tenantId_idx" ON "PatrolSite"("tenantId");

-- CreateIndex
CREATE INDEX "PatrolSite_tenantId_isActive_idx" ON "PatrolSite"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PatrolSite_tenantId_name_key" ON "PatrolSite"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PatrolCheckpoint_token_key" ON "PatrolCheckpoint"("token");

-- CreateIndex
CREATE INDEX "PatrolCheckpoint_patrolSiteId_idx" ON "PatrolCheckpoint"("patrolSiteId");

-- CreateIndex
CREATE INDEX "PatrolCheckpoint_token_idx" ON "PatrolCheckpoint"("token");

-- CreateIndex
CREATE INDEX "PatrolSchedule_tenantId_idx" ON "PatrolSchedule"("tenantId");

-- CreateIndex
CREATE INDEX "PatrolSchedule_tenantId_isActive_idx" ON "PatrolSchedule"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "PatrolSchedule_assignedUserId_idx" ON "PatrolSchedule"("assignedUserId");

-- CreateIndex
CREATE INDEX "PatrolSchedule_patrolSiteId_idx" ON "PatrolSchedule"("patrolSiteId");

-- CreateIndex
CREATE INDEX "PatrolSession_patrolScheduleId_idx" ON "PatrolSession"("patrolScheduleId");

-- CreateIndex
CREATE INDEX "PatrolSession_assignedUserId_idx" ON "PatrolSession"("assignedUserId");

-- CreateIndex
CREATE INDEX "PatrolSession_status_idx" ON "PatrolSession"("status");

-- CreateIndex
CREATE INDEX "PatrolSession_slotStart_slotEnd_idx" ON "PatrolSession"("slotStart", "slotEnd");

-- CreateIndex
CREATE INDEX "PatrolSession_assignedUserId_slotStart_idx" ON "PatrolSession"("assignedUserId", "slotStart");

-- CreateIndex
CREATE UNIQUE INDEX "PatrolSession_patrolScheduleId_slotStart_key" ON "PatrolSession"("patrolScheduleId", "slotStart");

-- CreateIndex
CREATE INDEX "PatrolScanEvent_patrolSessionId_idx" ON "PatrolScanEvent"("patrolSessionId");

-- CreateIndex
CREATE INDEX "PatrolScanEvent_checkpointId_idx" ON "PatrolScanEvent"("checkpointId");

-- CreateIndex
CREATE INDEX "PatrolScanEvent_scannedByUserId_idx" ON "PatrolScanEvent"("scannedByUserId");

-- CreateIndex
CREATE INDEX "PatrolScanEvent_scannedAt_idx" ON "PatrolScanEvent"("scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PatrolScanEvent_patrolSessionId_checkpointId_key" ON "PatrolScanEvent"("patrolSessionId", "checkpointId");

-- AddForeignKey
ALTER TABLE "PatrolSite" ADD CONSTRAINT "PatrolSite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolCheckpoint" ADD CONSTRAINT "PatrolCheckpoint_patrolSiteId_fkey" FOREIGN KEY ("patrolSiteId") REFERENCES "PatrolSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSchedule" ADD CONSTRAINT "PatrolSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSchedule" ADD CONSTRAINT "PatrolSchedule_patrolSiteId_fkey" FOREIGN KEY ("patrolSiteId") REFERENCES "PatrolSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSchedule" ADD CONSTRAINT "PatrolSchedule_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSession" ADD CONSTRAINT "PatrolSession_patrolScheduleId_fkey" FOREIGN KEY ("patrolScheduleId") REFERENCES "PatrolSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolSession" ADD CONSTRAINT "PatrolSession_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolScanEvent" ADD CONSTRAINT "PatrolScanEvent_patrolSessionId_fkey" FOREIGN KEY ("patrolSessionId") REFERENCES "PatrolSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolScanEvent" ADD CONSTRAINT "PatrolScanEvent_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "PatrolCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatrolScanEvent" ADD CONSTRAINT "PatrolScanEvent_scannedByUserId_fkey" FOREIGN KEY ("scannedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
