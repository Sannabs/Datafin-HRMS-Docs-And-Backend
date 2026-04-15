/**
 * Recalculate PAYE (GRA) on all existing payslips using the current calculateGambiaPAYE()
 * (e.g. after updating GRA band rates), then refresh each affected PayrollRun totals.
 *
 * Skips payslips with no breakdownSnapshot or no "PAYE (GRA)" deduction line (e.g. tax-exempt
 * employees when statutory PAYE was omitted, or non-Gambia runs).
 *
 * Does not regenerate PDFs (filePath unchanged). Regenerate payslip PDFs in-app if needed.
 *
 * Usage:
 *   node scripts/backfill-paye-gra-all-runs.js            # persist changes (writes DB)
 *   node scripts/backfill-paye-gra-all-runs.js --dry-run   # preview only (no writes)
 */

import "dotenv/config";
import prisma from "../config/prisma.config.js";
import { calculateGambiaPAYE } from "../constants/gambia-payroll.defaults.js";

const DRY_RUN = process.argv.includes("--dry-run");
const APPLY = !DRY_RUN;
const BATCH = 250;

const PAYE_NAME = "PAYE (GRA)";

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function findPayeIndex(deductions) {
    if (!Array.isArray(deductions)) return -1;
    return deductions.findIndex((d) => d && d.name === PAYE_NAME);
}

/**
 * @returns {{ changed: boolean, snapshot: object, totalDeductions: number, netSalary: number, hasWarnings: boolean, warnings: object|null, oldPaye: number, newPaye: number } | { skip: string }}
 */
function buildPayslipUpdate(payslip) {
    const snap = payslip.breakdownSnapshot;
    if (snap == null || typeof snap !== "object") {
        return { skip: "skip_no_snapshot" };
    }
    const idx = findPayeIndex(snap.deductions);
    if (idx < 0) {
        return { skip: "skip_no_paye_line" };
    }

    const snapshot = JSON.parse(JSON.stringify(snap));
    const gross = round2(payslip.grossSalary);
    const oldPaye = round2(snapshot.deductions[idx].amount);
    const newPaye = calculateGambiaPAYE(gross);

    if (oldPaye === newPaye) {
        return { skip: "unchanged" };
    }

    snapshot.deductions[idx].amount = newPaye;

    const oldTotalDed = round2(payslip.totalDeductions);
    const newTotalDed = round2(oldTotalDed - oldPaye + newPaye);
    const originalNet = round2(gross - newTotalDed);
    const netSalary = Math.max(0, originalNet);
    const hasWarnings = originalNet < 0;
    const warnings = hasWarnings
        ? {
              hasNegativeNetSalary: true,
              originalNetSalary: originalNet,
              message: `Deductions exceed gross salary. Original net: ${originalNet.toFixed(2)}, adjusted to 0.`,
          }
        : null;

    return {
        changed: true,
        snapshot,
        totalDeductions: newTotalDed,
        netSalary,
        hasWarnings,
        warnings,
        oldPaye,
        newPaye,
    };
}

/** Same aggregation as payroll-run.service calculatePayrollRunTotals (kept local to avoid BullMQ/Redis imports). */
async function refreshRunTotals(payrollRunId) {
    const payslips = await prisma.payslip.findMany({
        where: { payrollRunId },
        select: {
            grossSalary: true,
            totalAllowances: true,
            totalDeductions: true,
            netSalary: true,
        },
    });
    const totalGrossPay = payslips.reduce((sum, p) => sum + Number(p.grossSalary), 0);
    const totalAllowances = payslips.reduce((sum, p) => sum + Number(p.totalAllowances), 0);
    const totalDeductions = payslips.reduce((sum, p) => sum + Number(p.totalDeductions), 0);
    const totalNetPay = payslips.reduce((sum, p) => sum + Number(p.netSalary), 0);
    const totalEmployees = payslips.length;

    await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: {
            totalGrossPay,
            totalAllowances,
            totalDeductions,
            totalNetPay,
            totalEmployees,
        },
    });
}

async function main() {
    const stats = {
        scanned: 0,
        skip_no_snapshot: 0,
        skip_no_paye_line: 0,
        unchanged: 0,
        would_update: 0,
        updated: 0,
        runs_totals_refreshed: 0,
        errors: 0,
    };

    const affectedRunIds = new Set();
    let cursor = null;

    console.log(APPLY ? "MODE: writing to database" : "MODE: --dry-run (no writes)");

    for (;;) {
        const batch = await prisma.payslip.findMany({
            take: BATCH,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
            select: {
                id: true,
                payrollRunId: true,
                grossSalary: true,
                totalDeductions: true,
                netSalary: true,
                breakdownSnapshot: true,
            },
        });

        if (batch.length === 0) break;

        for (const p of batch) {
            stats.scanned++;
            const result = buildPayslipUpdate(p);

            if (result.skip) {
                stats[result.skip]++;
                continue;
            }

            stats.would_update++;
            affectedRunIds.add(p.payrollRunId);

            if (APPLY) {
                try {
                    await prisma.payslip.update({
                        where: { id: p.id },
                        data: {
                            totalDeductions: result.totalDeductions,
                            netSalary: result.netSalary,
                            breakdownSnapshot: result.snapshot,
                            hasWarnings: result.hasWarnings,
                            warnings: result.warnings,
                        },
                    });
                    stats.updated++;
                } catch (e) {
                    stats.errors++;
                    console.error(`Error updating payslip ${p.id}:`, e.message);
                }
            }
        }

        cursor = batch[batch.length - 1].id;
    }

    if (APPLY && affectedRunIds.size > 0) {
        console.log(`Refreshing totals for ${affectedRunIds.size} payroll run(s)…`);
        for (const runId of affectedRunIds) {
            try {
                await refreshRunTotals(runId);
                stats.runs_totals_refreshed++;
            } catch (e) {
                stats.errors++;
                console.error(`Error refreshing run ${runId}:`, e.message);
            }
        }
    } else if (!APPLY && affectedRunIds.size > 0) {
        console.log(`Dry-run: ${affectedRunIds.size} payroll run(s) would have totals refreshed.`);
    }

    console.log("Summary:", stats);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
