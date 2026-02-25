/**
 * Seed script: Payslips.
 * Usage: node scripts/seed-payslips.js
 * (from backend directory, with .env DATABASE_URL set)
 *
 * Seeds payslips for the target user. Creates pay schedule, pay periods, and
 * payroll runs only when missing so that each period has a payslip. Covers the
 * last 6 months so the mobile Pay tab has data for testing.
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";

const TENANT_ID = process.env.TENANT_ID || "375e02fd-68f0-441d-be53-e6bbd49a746f";
const USER_ID   = process.env.USER_ID   || "3kOBHsM5gfyp8EDI2lqFxfRgPVboxDyM";
const CURRENCY  = "GMD";
const MONTHS_BACK = 6;

const BASE_SALARY   = 30000;
const ALLOWANCES    = [
    { name: "Transport Allowance",  amount: 2000,  calculationMethod: "FIXED",      description: "Monthly transport" },
    { name: "Housing Allowance",    amount: 500,   calculationMethod: "FIXED",      description: "Rent subsidy" },
];
const DEDUCTIONS    = [
    { name: "SSHFC (Employee 5%)",  amount: 0,     calculationMethod: "PERCENTAGE", description: "5% of gross salary" },
    { name: "Income Tax",           amount: 1200,  calculationMethod: "FIXED",      description: "Monthly PAYE" },
];

function monthStart(monthsAgo) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - monthsAgo);
    d.setHours(0, 0, 0, 0);
    return d;
}

function monthEnd(monthsAgo) {
    const d = monthStart(monthsAgo);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    d.setHours(23, 59, 59, 999);
    return d;
}

function periodName(date) {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function runCode(date) {
    const mon = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
    return `${mon}-${date.getFullYear()}`;
}

async function seed() {
    console.log("Seeding payslips...");
    console.log("tenantId:", TENANT_ID);
    console.log("userId:  ", USER_ID);

    const user = await prisma.user.findUnique({ where: { id: USER_ID } });
    if (!user) throw new Error(`User not found: ${USER_ID}`);

    const tenant = await prisma.tenant.findUnique({ where: { id: TENANT_ID } });
    if (!tenant) throw new Error(`Tenant not found: ${TENANT_ID}`);

    let payslipsCreated = 0;

    // Ensure pay schedule exists (needed for payslips)
    let schedule = await prisma.paySchedule.findFirst({
        where: { tenantId: TENANT_ID, frequency: "MONTHLY", isActive: true },
    });
    if (!schedule) {
        schedule = await prisma.paySchedule.create({
            data: {
                tenantId: TENANT_ID,
                name: "Monthly Payroll",
                frequency: "MONTHLY",
                isActive: true,
            },
        });
        console.log("Created pay schedule:", schedule.id);
    } else {
        console.log("Using existing pay schedule:", schedule.id);
    }

    // Create payslips for last N months (period + run created only when missing)
    for (let ago = MONTHS_BACK; ago >= 0; ago--) {
        const start = monthStart(ago);
        const end   = monthEnd(ago);
        const pName = periodName(start);
        const rCode = runCode(start);

        // Upsert pay period
        let period = await prisma.payPeriod.findFirst({
            where: { tenantId: TENANT_ID, periodName: pName },
        });
        if (!period) {
            period = await prisma.payPeriod.create({
                data: {
                    tenantId: TENANT_ID,
                    payScheduleId: schedule.id,
                    periodName: pName,
                    startDate: start,
                    endDate: end,
                    calendarMonth: start.getMonth() + 1,
                    calendarYear: start.getFullYear(),
                    status: "COMPLETED",
                },
            });
            console.log("Created pay period:", pName);
        }

        // Upsert payroll run
        let run = await prisma.payrollRun.findFirst({
            where: { tenantId: TENANT_ID, payPeriodId: period.id },
        });

        const totalAllowances = ALLOWANCES.reduce((s, a) => s + a.amount, 0);
        const grossSalary     = BASE_SALARY + totalAllowances;
        const sshfcEmployee   = Math.round(grossSalary * 0.05 * 100) / 100;
        const fixedDeductions = DEDUCTIONS.filter(d => d.calculationMethod === "FIXED")
                                          .reduce((s, d) => s + d.amount, 0);
        const totalDeductions = sshfcEmployee + fixedDeductions;
        const netSalary       = grossSalary - totalDeductions;

        if (!run) {
            run = await prisma.payrollRun.create({
                data: {
                    tenantId: TENANT_ID,
                    payPeriodId: period.id,
                    runCode: rCode,
                    runDate: end,
                    totalEmployees: 1,
                    totalGrossPay: grossSalary,
                    totalAllowances,
                    totalDeductions,
                    totalNetPay: netSalary,
                    status: "COMPLETED",
                    processedAt: end,
                },
            });
            console.log("Created payroll run:", rCode);
        }

        // Upsert payslip
        const existing = await prisma.payslip.findFirst({
            where: { payrollRunId: run.id, userId: USER_ID },
        });
        if (existing) {
            console.log("Payslip already exists for", pName, "- skipping");
            continue;
        }

        const deductionsWithAmount = DEDUCTIONS.map((d) => {
            if (d.calculationMethod === "PERCENTAGE") {
                return { ...d, amount: sshfcEmployee };
            }
            return d;
        });

        const breakdownSnapshot = {
            baseSalary: BASE_SALARY,
            currency: CURRENCY,
            allowances: ALLOWANCES,
            deductions: deductionsWithAmount,
            employerSSHFCRate: 10,
            employerSSHFCAmount: Math.round(grossSalary * 0.10 * 100) / 100,
        };

        const hasWarnings = ago === 3;

        await prisma.payslip.create({
            data: {
                payrollRunId: run.id,
                userId: USER_ID,
                grossSalary,
                totalAllowances,
                totalDeductions,
                netSalary,
                generatedAt: end,
                hasWarnings,
                warnings: hasWarnings ? JSON.stringify("Late submission for transport allowance.") : null,
                breakdownSnapshot,
            },
        });
        payslipsCreated += 1;
        console.log("Created payslip for", pName, `(net: ${netSalary})`);
    }

    console.log("\nPayslip seed complete. Created", payslipsCreated, "payslip(s).");
}

seed()
    .catch((e) => {
        console.error("Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
