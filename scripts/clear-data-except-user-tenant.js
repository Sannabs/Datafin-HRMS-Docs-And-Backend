/**
 * Empties all data in the database except User, Tenant, Session, Account, Department, and Position.
 * Run from backend directory: node scripts/clear-data-except-user-tenant.js
 * Or: npm run db:clear
 *
 * Session and Account are kept so you can still log in after clearing.
 * Department and Position are kept so user assignments remain valid.
 * Order respects foreign keys: children are deleted before parents.
 */

import prisma from "../config/prisma.config.js";

async function main() {
  console.log("Clearing all data except User, Tenant, Session, Account, Department, and Position...");

  // Unlink User from Shift so we can delete Shift
  await prisma.user.updateMany({ data: { shiftId: null } });

  const deleteOrder = [
    "auditLog",
    "invitation",
    "leaveRequest",
    "payslip",
    "payrollProgress",
    "payrollRun",
    "payPeriod",
    "paySchedule",
    "allowance",
    "deduction",
    "salaryStructure",
    "calculationRule",
    "allowanceType",
    "deductionType",
    "attendance",
    "location",
    "employeeWorkConfig",
    "companyWorkDay",
    "shift",
    "yearlyEntitlement",
    "annualLeavePolicy",
    "leaveType",
    "holiday",
    "notification",
    "verification",
  ];

  for (const model of deleteOrder) {
    try {
      const result = await prisma[model].deleteMany({});
      const count = result?.count ?? 0;
      if (count > 0) {
        console.log(`  ${model}: deleted ${count} row(s)`);
      }
    } catch (err) {
      console.error(`  ${model}: ${err.message}`);
      throw err;
    }
  }

  console.log("Done. User, Tenant, Session, Account, Department, and Position are unchanged. You can still log in.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
