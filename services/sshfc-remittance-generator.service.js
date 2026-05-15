import puppeteer from "puppeteer";
import pLimit from "p-limit";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { uploadSshfcRemittance, deletePayslip, getPayslipBuffer } from "./file-storage.service.js";
import {
    getBaseSalaryFromBreakdownSnapshot,
    getIicfFromBreakdownSnapshot,
    getSshfcTotalRemittanceFromBreakdownSnapshot,
} from "../utils/payslip.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const templatePath =
    process.env.SSHFC_REMITTANCE_TEMPLATE_PATH || join(__dirname, "../templates/sshfc-remittance.html");
const logoPath = process.env.SSHFC_REMITTANCE_LOGO_PATH || join(__dirname, "../images/sshfc.png");

const SSHFC_PDF_MARGIN_MM = 10;

const sshfcPdfBrowserLimit = pLimit(1);

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
    return `${month.toUpperCase()} ${y}`;
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
 * @param {import("puppeteer").Browser} browser
 * @param {string} html
 */
async function renderHtmlToPdfBuffer(browser, html) {
    const page = await browser.newPage();
    try {
        await page.setViewport({ width: 794, height: 1200, deviceScaleFactor: 1 });
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await page.emulateMediaType("print");

        const usableHeightMm = 297 - SSHFC_PDF_MARGIN_MM * 2;
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
            scale = Math.min(1, Math.max(scale, 0.55));
        }

        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: `${SSHFC_PDF_MARGIN_MM}mm`,
                right: `${SSHFC_PDF_MARGIN_MM}mm`,
                bottom: `${SSHFC_PDF_MARGIN_MM}mm`,
                left: `${SSHFC_PDF_MARGIN_MM}mm`,
            },
            scale,
            preferCSSPageSize: false,
        });
    } finally {
        await page.close();
    }
}

/**
 * @param {object} run
 * @returns {Promise<Buffer>}
 */
export async function buildSshfcRemittancePdfBuffer(run) {
    let template = await readFile(templatePath, "utf-8");
    let logoBuf;
    try {
        logoBuf = await readFile(logoPath);
    } catch (e) {
        logger.error(`SSHFC remittance: logo read failed: ${e.message}`);
        throw new Error("SSHFC logo not found");
    }
    const logoDataUri = `data:image/png;base64,${logoBuf.toString("base64")}`;

    const sorted = [...run.payslips].sort((a, b) => {
        const an = (a.user?.name || a.user?.employeeId || "").toLowerCase();
        const bn = (b.user?.name || b.user?.employeeId || "").toLowerCase();
        return an.localeCompare(bn);
    });

    let totalBasic = 0;
    let totalContr = 0;
    let totalIicf = 0;

    const rows = sorted.map((slip) => {
        const basic = getBaseSalaryFromBreakdownSnapshot(slip.breakdownSnapshot);
        const contr = getSshfcTotalRemittanceFromBreakdownSnapshot(slip.breakdownSnapshot);
        const iicf = getIicfFromBreakdownSnapshot(slip.breakdownSnapshot);
        totalBasic += basic;
        totalContr += contr;
        totalIicf += iicf;
        const ssnRaw = slip.user?.SSN != null ? String(slip.user.SSN).trim() : "";
        const ssnDisplay = ssnRaw.length > 0 ? ssnRaw : "—";
        const name = slip.user?.name?.trim() || "—";
        return `<tr>
          <td>${escapeHtml(ssnDisplay)}</td>
          <td>${escapeHtml(name)}</td>
          <td class="num">${formatDalasi(basic)}</td>
          <td class="num">${formatDalasi(contr)}</td>
          <td class="num">${formatDalasi(iicf)}</td>
        </tr>`;
    });

    totalBasic = Math.round(totalBasic * 100) / 100;
    totalContr = Math.round(totalContr * 100) / 100;
    totalIicf = Math.round(totalIicf * 100) / 100;

    const totalsRow = `<tr class="totals">
      <td colspan="2" class="total-label"><strong>TOTALS</strong></td>
      <td class="num"><strong>${formatDalasi(totalBasic)}</strong></td>
      <td class="num"><strong>${formatDalasi(totalContr)}</strong></td>
      <td class="num"><strong>${formatDalasi(totalIicf)}</strong></td>
    </tr>`;

    const employerName =
        run.tenant?.name && String(run.tenant.name).trim() !== "" ? String(run.tenant.name).trim() : "—";
    const phoneRaw = run.tenant?.phone != null ? String(run.tenant.phone).trim() : "";
    const telephone = phoneRaw.length > 0 ? phoneRaw : "—";

    const replacements = {
        LOGO_DATA_URI: logoDataUri,
        MONTH_TITLE: escapeHtml(monthTitleFromPayPeriod(run.payPeriod)),
        EMPLOYER_NAME: escapeHtml(employerName),
        TELEPHONE: escapeHtml(telephone),
        TABLE_BODY: rows.join("\n") + totalsRow,
    };

    for (const [key, val] of Object.entries(replacements)) {
        template = template.split(`{{${key}}}`).join(val);
    }

    return sshfcPdfBrowserLimit(async () => {
        const browser = await launchBrowser();
        try {
            return await renderHtmlToPdfBuffer(browser, template);
        } finally {
            await browser.close();
        }
    });
}

/**
 * Generate SSHFC remittance advice PDF for a completed payroll run, upload to R2, persist SshfcRemittanceDocument.
 * @param {string} payrollRunId
 * @returns {Promise<object | null>}
 */
export async function generateAndPersistSshfcRemittanceForPayrollRun(payrollRunId) {
    const run = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        include: {
            payPeriod: true,
            tenant: true,
            payslips: {
                include: {
                    user: {
                        select: { id: true, name: true, SSN: true, employeeId: true },
                    },
                },
            },
            sshfcRemittanceDocument: true,
        },
    });

    if (!run) {
        logger.warn(`SSHFC remittance: payroll run not found ${payrollRunId}`);
        return null;
    }

    if (run.status !== "COMPLETED") {
        logger.debug(`SSHFC remittance: skip run ${payrollRunId} (status ${run.status})`);
        return null;
    }

    if (!run.tenant?.gambiaStatutoryEnabled) {
        logger.info(`SSHFC remittance: skip run ${payrollRunId} (Gambia statutory disabled)`);
        return null;
    }

    if (!run.payslips.length) {
        logger.warn(`SSHFC remittance: skip run ${payrollRunId} (no payslips)`);
        return null;
    }

    if (run.sshfcRemittanceDocument) {
        try {
            await deletePayslip(run.sshfcRemittanceDocument.filePath);
        } catch (delErr) {
            logger.warn(`SSHFC remittance: could not delete previous file: ${delErr.message}`);
        }
        await prisma.sshfcRemittanceDocument.delete({
            where: { payrollRunId },
        });
    }

    const pdfBuffer = await buildSshfcRemittancePdfBuffer(run);
    const safePeriod = String(run.payPeriod.periodName || "period")
        .replace(/[^\w\-]+/g, "-")
        .slice(0, 80);
    const displayName = `SSHFC-Remittance-${safePeriod}.pdf`;

    const year = run.payPeriod.calendarYear ?? new Date(run.payPeriod.endDate).getFullYear();
    const month = run.payPeriod.calendarMonth ?? new Date(run.payPeriod.endDate).getMonth() + 1;

    const upload = await uploadSshfcRemittance(
        Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer),
        payrollRunId,
        run.tenantId,
        year,
        month
    );

    const doc = await prisma.sshfcRemittanceDocument.create({
        data: {
            payrollRunId,
            tenantId: run.tenantId,
            name: displayName,
            size: pdfBuffer.length,
            filePath: upload.public_id,
        },
    });

    logger.info(`SSHFC remittance generated for payroll run ${payrollRunId}`, {
        payrollRunId,
        documentId: doc.id,
        size: doc.size,
    });

    return doc;
}

/**
 * @param {string} payrollRunId
 * @param {string} tenantId
 * @returns {Promise<{ buffer: Buffer, filename: string } | null>}
 */
export async function getSshfcRemittancePdfForDownload(payrollRunId, tenantId) {
    const doc = await prisma.sshfcRemittanceDocument.findFirst({
        where: { payrollRunId, tenantId },
    });
    if (!doc?.filePath) return null;
    const buffer = await getPayslipBuffer(doc.filePath);
    return { buffer, filename: doc.name };
}
