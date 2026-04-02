import {
  EmployeeWarningSeverity,
  EmployeeWarningStatus,
} from "@prisma/client";
import prisma from "../config/prisma.config.js";

const ACTIVE_FOR_POLICY = [
  EmployeeWarningStatus.ISSUED,
  EmployeeWarningStatus.ACKNOWLEDGED,
  EmployeeWarningStatus.APPEAL_OPEN,
  EmployeeWarningStatus.APPEAL_REVIEW,
  EmployeeWarningStatus.APPEAL_UPHELD,
  EmployeeWarningStatus.APPEAL_AMENDED,
  EmployeeWarningStatus.ESCALATED,
];

/**
 * Rolling-window signals for HR (3+ active warnings in 12 months, any open FINAL).
 */
export async function getWarningEscalationSummaryForEmployee(tenantId, userId) {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const rows = await prisma.employeeWarning.findMany({
    where: {
      tenantId,
      userId,
      status: { in: ACTIVE_FOR_POLICY },
    },
    select: {
      id: true,
      issuedAt: true,
      createdAt: true,
      severity: true,
      status: true,
      finalFollowUpDueAt: true,
    },
  });

  const inWindow = rows.filter((r) => {
    const t = r.issuedAt ?? r.createdAt;
    return t >= twelveMonthsAgo;
  });

  const hasActiveFinalWarning = rows.some(
    (r) => r.severity === EmployeeWarningSeverity.FINAL
  );

  return {
    activeWarningsLast12Months: inWindow.length,
    suggestEscalationReview: inWindow.length >= 3,
    hasActiveFinalWarning,
  };
}
