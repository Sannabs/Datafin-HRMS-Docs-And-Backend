import puppeteer from "puppeteer";
import pLimit from "p-limit";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { uploadGraPayeSchedule, deletePayslip, getPayslipBuffer } from "./file-storage.service.js";
import { getPayeFromBreakdownSnapshot } from "../utils/payslip.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templatePath =
    process.env.GRA_PAYE_SCHEDULE_TEMPLATE_PATH || join(__dirname, "../templates/gra-paye-schedule.html");
const logoPath = process.env.GRA_LOGO_PATH || join(__dirname, "../images/gra-logo.png");

const EMPLOYER_TIN_PLACEHOLDER =
    process.env.GRA_EMPLOYER_TIN_PLACEHOLDER?.trim() || "[EMPLOYER TIN — configure GRA_EMPLOYER_TIN_PLACEHOLDER]";

/** Tight margins so one A4 page fits for typical headcounts before scaling. */
const GRA_PDF_MARGIN_MM = 8;

const graScheduleBrowserLimit = pLimit(1);

function escapeHtml(s) {
    if (s == null || s === "") return "—";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatDalasi(amount) {
    const n = Number(amount);
    const v = Number.isFinite(n) ? n : 0;
    return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(v);
}

function monthTitleFromPayPeriod(payPeriod) {
    const y = payPeriod.calendarYear ?? new Date(payPeriod.endDate).getFullYear();
    const m = payPeriod.calendarMonth ?? new Date(payPeriod.endDate).getMonth() + 1;
    const d = new Date(y, m - 1, 1);
    const month = d.toLocaleString("en-US", { month: "long" });
    return `${month} ${y}`;
}

function buildEmployerAddress(tenant) {
    const parts = [tenant.address, tenant.addressLine1, tenant.addressLine2].filter(
        (x) => x != null && String(x).trim() !== ""
    );
    return parts.length > 0 ? parts.map((x) => String(x).trim()).join(", ") : "—";
}

/**
 * @param {string[]} userIds
 * @param {string} tenantId
 * @param {Date} periodEndDate
 * @returns {Promise<{ grossYtdByUser: Map<string, number>, payeYtdByUser: Map<string, number> }>}
 */
async function loadGrossAndPayeYtdForUsers(userIds, tenantId, periodEndDate) {
    const end = periodEndDate instanceof Date ? periodEndDate : new Date(periodEndDate);
    const year = end.getFullYear();
    const startOfYear = new Date(year, 0, 1);

    const grossYtdByUser = new Map();
    const payeYtdByUser = new Map();

    if (userIds.length === 0) {
        return { grossYtdByUser, payeYtdByUser };
    }

    const slips = await prisma.payslip.findMany({
        where: {
            userId: { in: userIds },
            payrollRun: {
                tenantId,
                payPeriod: {
                    endDate: { gte: startOfYear, lte: end },
                },
            },
        },
        select: {
            userId: true,
            grossSalary: true,
            breakdownSnapshot: true,
        },
    });

    for (const s of slips) {
        const uid = s.userId;
        grossYtdByUser.set(uid, (grossYtdByUser.get(uid) || 0) + Number(s.grossSalary));
        payeYtdByUser.set(uid, (payeYtdByUser.get(uid) || 0) + getPayeFromBreakdownSnapshot(s.breakdownSnapshot));
    }

    for (const uid of userIds) {
        grossYtdByUser.set(uid, Math.round((grossYtdByUser.get(uid) || 0) * 100) / 100);
        payeYtdByUser.set(uid, Math.round((payeYtdByUser.get(uid) || 0) * 100) / 100);
    }

    return { grossYtdByUser, payeYtdByUser };
}

const launchBrowser = () => {
    const executablePath =
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        (process.env.RENDER ? "/opt/render/project/.render/chrome/opt/google/chrome/google-chrome" : undefined);
    return puppeteer.launch({
        headless: true,
        ...(executablePath && { executablePath }),
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
};

/**
 * Render HTML to PDF; scales down to fit one A4 page when content is only slightly too tall
 * (large employee lists still paginate naturally).
 * @param {import("puppeteer").Browser} browser
 * @param {string} html
 */
async function renderHtmlToPdfBuffer(browser, html) {
    const page = await browser.newPage();
    try {
        await page.setViewport({ width: 794, height: 1200, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.emulateMediaType("print");

        const usableHeightMm = 297 - GRA_PDF_MARGIN_MM * 2;
        const usableHeightPx = (usableHeightMm / 25.4) * 96;

        const contentHeight = await page.evaluate(() =>
            Math.ceil(
                Math.max(
                    document.body?.scrollHeight ?? 0,
                    document.documentElement?.scrollHeight ?? 0
                )
            )
        );

        let scale = 1;
        if (contentHeight > usableHeightPx + 1) {
            scale = usableHeightPx / contentHeight;
            scale = Math.min(1, Math.max(scale, 0.62));
        }

        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: `${GRA_PDF_MARGIN_MM}mm`,
                right: `${GRA_PDF_MARGIN_MM}mm`,
                bottom: `${GRA_PDF_MARGIN_MM}mm`,
                left: `${GRA_PDF_MARGIN_MM}mm`,
            },
            scale,
            preferCSSPageSize: false,
        });
    } finally {
        await page.close();
    }
}

/**
 * Build PDF buffer for a payroll run (does not persist).
 * @param {object} run
 * @returns {Promise<Buffer>}
 */
export async function buildGraPayeSchedulePdfBuffer(run) {
    let template = await readFile(templatePath, "utf-8");
    let logoBuf;
    try {
        logoBuf = await readFile(logoPath);
    } catch (e) {
        logger.error(`GRA PAYE schedule: logo read failed: ${e.message}`);
        throw new Error("GRA logo not found");
    }
    const logoDataUri = `data:image/png;base64,${logoBuf.toString("base64")}`;

    const userIds = run.payslips.map((p) => p.userId);
    const { grossYtdByUser, payeYtdByUser } = await loadGrossAndPayeYtdForUsers(
        userIds,
        run.tenantId,
        run.payPeriod.endDate
    );

    const sorted = [...run.payslips].sort((a, b) => {
        const an = (a.user?.name || a.user?.employeeId || "").toLowerCase();
        const bn = (b.user?.name || b.user?.employeeId || "").toLowerCase();
        return an.localeCompare(bn);
    });

    let totalGross = 0;
    let totalGrossYtd = 0;
    let totalPaye = 0;
    let totalPayeYtd = 0;

    const rows = sorted.map((slip, idx) => {
        const gross = Number(slip.grossSalary) || 0;
        const paye = getPayeFromBreakdownSnapshot(slip.breakdownSnapshot);
        const gy = grossYtdByUser.get(slip.userId) ?? 0;
        const py = payeYtdByUser.get(slip.userId) ?? 0;
        totalGross += gross;
        totalGrossYtd += gy;
        totalPaye += paye;
        totalPayeYtd += py;
        const tin = slip.user?.tinNumber?.trim() || "";
        const name = slip.user?.name?.trim() || "—";
        return `<tr>
          <td class="c">${idx + 1}</td>
          <td class="c">${escapeHtml(tin || "—")}</td>
          <td>${escapeHtml(name)}</td>
          <td class="num">${formatDalasi(gross)}</td>
          <td class="num">${formatDalasi(gy)}</td>
          <td class="num">${formatDalasi(paye)}</td>
          <td class="num">${formatDalasi(py)}</td>
        </tr>`;
    });

    totalGross = Math.round(totalGross * 100) / 100;
    totalGrossYtd = Math.round(totalGrossYtd * 100) / 100;
    totalPaye = Math.round(totalPaye * 100) / 100;
    totalPayeYtd = Math.round(totalPayeYtd * 100) / 100;

    const totalsRow = `<tr class="totals">
      <td class="c" colspan="3"><strong>Totals</strong></td>
      <td class="num"><strong>${formatDalasi(totalGross)}</strong></td>
      <td class="num"><strong>${formatDalasi(totalGrossYtd)}</strong></td>
      <td class="num"><strong>${formatDalasi(totalPaye)}</strong></td>
      <td class="num"><strong>${formatDalasi(totalPayeYtd)}</strong></td>
    </tr>`;

    const employerName =
        run.tenant?.name && String(run.tenant.name).trim() !== "" ? String(run.tenant.name).trim() : "—";

    const replacements = {
        LOGO_DATA_URI: logoDataUri,
        MONTH_TITLE: escapeHtml(monthTitleFromPayPeriod(run.payPeriod)),
        EMPLOYER_TIN: escapeHtml(EMPLOYER_TIN_PLACEHOLDER),
        EMPLOYER_NAME: escapeHtml(employerName),
        EMPLOYER_ADDRESS: escapeHtml(buildEmployerAddress(run.tenant)),
        TABLE_BODY: rows.join("\n") + totalsRow,
    };

    for (const [key, val] of Object.entries(replacements)) {
        template = template.split(`{{${key}}}`).join(val);
    }

    return graScheduleBrowserLimit(async () => {
        const browser = await launchBrowser();
        try {
            return await renderHtmlToPdfBuffer(browser, template);
        } finally {
            await browser.close();
        }
    });
}

/**
 * Generate GRA PAYE schedule PDF for a completed payroll run, upload to R2, persist GraPayeScheduleDocument.
 * No-op if run is not completed, tenant has Gambia statutory off, or there are no payslips.
 * @param {string} payrollRunId
 * @returns {Promise<import("@prisma/client").GraPayeScheduleDocument | null>}
 */
export async function generateAndPersistGraPayeScheduleForPayrollRun(payrollRunId) {
    const run = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        include: {
            payPeriod: true,
            tenant: true,
            payslips: {
                include: {
                    user: {
                        select: { id: true, name: true, tinNumber: true, employeeId: true },
                    },
                },
            },
            graPayeScheduleDocument: true,
        },
    });

    if (!run) {
        logger.warn(`GRA PAYE schedule: payroll run not found ${payrollRunId}`);
        return null;
    }

    if (run.status !== "COMPLETED") {
        logger.debug(`GRA PAYE schedule: skip run ${payrollRunId} (status ${run.status})`);
        return null;
    }

    if (!run.tenant?.gambiaStatutoryEnabled) {
        logger.info(`GRA PAYE schedule: skip run ${payrollRunId} (Gambia statutory disabled)`);
        return null;
    }

    if (!run.payslips.length) {
        logger.warn(`GRA PAYE schedule: skip run ${payrollRunId} (no payslips)`);
        return null;
    }

    if (run.graPayeScheduleDocument) {
        try {
            await deletePayslip(run.graPayeScheduleDocument.filePath);
        } catch (delErr) {
            logger.warn(`GRA PAYE schedule: could not delete previous file: ${delErr.message}`);
        }
        await prisma.graPayeScheduleDocument.delete({
            where: { payrollRunId },
        });
    }

    const pdfBuffer = await buildGraPayeSchedulePdfBuffer(run);
    const safePeriod = String(run.payPeriod.periodName || "period")
        .replace(/[^\w\-]+/g, "-")
        .slice(0, 80);
    const displayName = `GRA-PAYE-Schedule-${safePeriod}.pdf`;

    const year = run.payPeriod.calendarYear ?? new Date(run.payPeriod.endDate).getFullYear();
    const month = run.payPeriod.calendarMonth ?? new Date(run.payPeriod.endDate).getMonth() + 1;

    const upload = await uploadGraPayeSchedule(
        Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer),
        payrollRunId,
        run.tenantId,
        year,
        month
    );

    const doc = await prisma.graPayeScheduleDocument.create({
        data: {
            payrollRunId,
            tenantId: run.tenantId,
            name: displayName,
            size: pdfBuffer.length,
            filePath: upload.public_id,
        },
    });

    logger.info(`GRA PAYE schedule generated for payroll run ${payrollRunId}`, {
        payrollRunId,
        documentId: doc.id,
        size: doc.size,
    });

    return doc;
}

/**
 * PDF buffer for download from stored document.
 * @param {string} payrollRunId
 * @param {string} tenantId
 * @returns {Promise<{ buffer: Buffer, filename: string } | null>}
 */
export async function getGraPayeSchedulePdfForDownload(payrollRunId, tenantId) {
    const doc = await prisma.graPayeScheduleDocument.findFirst({
        where: { payrollRunId, tenantId },
    });
    if (!doc?.filePath) return null;
    const buffer = await getPayslipBuffer(doc.filePath);
    return { buffer, filename: doc.name };
}
