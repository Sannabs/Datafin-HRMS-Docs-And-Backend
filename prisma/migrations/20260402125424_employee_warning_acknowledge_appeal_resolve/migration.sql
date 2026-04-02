-- CreateEnum
CREATE TYPE "EmployeeWarningAppealOutcome" AS ENUM ('UPHOLD', 'AMEND', 'VOID');

-- AlterTable
ALTER TABLE "employee_warning" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgedById" TEXT,
ADD COLUMN     "acknowledgementNote" TEXT,
ADD COLUMN     "acknowledgementRefusedAt" TIMESTAMP(3),
ADD COLUMN     "acknowledgementRefusedNote" TEXT,
ADD COLUMN     "appealAttachments" JSONB,
ADD COLUMN     "appealDecidedAt" TIMESTAMP(3),
ADD COLUMN     "appealDecidedById" TEXT,
ADD COLUMN     "appealDecisionNote" TEXT,
ADD COLUMN     "appealOpenedAt" TIMESTAMP(3),
ADD COLUMN     "appealOutcome" "EmployeeWarningAppealOutcome",
ADD COLUMN     "appealReason" TEXT,
ADD COLUMN     "appealReviewedAt" TIMESTAMP(3),
ADD COLUMN     "appealReviewedById" TEXT,
ADD COLUMN     "appealStatement" TEXT,
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalatedById" TEXT,
ADD COLUMN     "escalationNote" TEXT,
ADD COLUMN     "finalFollowUpDueAt" DATE,
ADD COLUMN     "resolutionNote" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "voidNote" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_appealReviewedById_fkey" FOREIGN KEY ("appealReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_appealDecidedById_fkey" FOREIGN KEY ("appealDecidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_warning" ADD CONSTRAINT "employee_warning_escalatedById_fkey" FOREIGN KEY ("escalatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
