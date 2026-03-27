-- CreateEnum
CREATE TYPE "FeedItemKind" AS ENUM ('ATTENDANCE', 'LEAVE', 'HOLIDAY', 'ATTENDANCE_EXCEPTION');

-- CreateEnum
CREATE TYPE "FeedItemUiStatus" AS ENUM ('PENDING', 'PRESENT', 'ABSENT', 'EXCUSED_ABSENCE', 'HOLIDAY');

-- CreateTable
CREATE TABLE "employee_feed_item" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedItemKind" NOT NULL,
    "uiStatus" "FeedItemUiStatus" NOT NULL,
    "sortAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_feed_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_feed_item_tenantId_userId_kind_sourceId_key" ON "employee_feed_item"("tenantId", "userId", "kind", "sourceId");

-- CreateIndex
CREATE INDEX "employee_feed_item_tenantId_userId_sortAt_idx" ON "employee_feed_item"("tenantId", "userId", "sortAt" DESC);

-- AddForeignKey
ALTER TABLE "employee_feed_item" ADD CONSTRAINT "employee_feed_item_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_feed_item" ADD CONSTRAINT "employee_feed_item_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
