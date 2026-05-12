import puppeteer from "puppeteer";
import pLimit from "p-limit";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../utils/logger.js";
import { uploadPayslip } from "./file-storage.service.js";
import prisma from "../config/prisma.config.js";
import { getPayslipBreakdown, getPayslipYTD, formatCurrency } from "../utils/payslip.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatePath = process.env.PAYSLIP_TEMPLATE_PATH || join(__dirname, "../templates/payslip.html");

/** Max concurrent Chromium processes for payslip PDF (launch → close); fixed at 2 via p-limit. */
const payslipBrowserConcurrency = Math.max(1, 2);
const browserInstanceLimit = pLimit(payslipBrowserConcurrency);

/**
 * Launch a shared Puppeteer browser instance (for batch use)
 */
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
 * Render HTML template to PDF buffer using an existing browser (caller manages browser lifecycle).
 * @param {import("puppeteer").Browser} browser
 * @param {string} template
 */
const renderPayslipPdfBuffer = async (browser, template) => {
    const page = await browser.newPage();
    try {
        await page.setContent(template, { waitUntil: "domcontentloaded" });
        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "20mm",
                right: "15mm",
                bottom: "20mm",
                left: "15mm",
            },
        });
    } finally {
        await page.close();
    }
};

/**
 * Generate payslip PDF and upload to Cloudflare R2
 * @param {string} payslipId - Payslip ID
 * @param {string} tenantId - Tenant ID
 * @param {Object} payslipData - Payslip data for template
 * @param {{ browser?: import("puppeteer").Browser }} [options] - Optional shared browser (caller must close)
 * @returns {Promise<Object>} Upload result with filename (as public_id) and secure_url
 */
export const generatePayslipPDF = async (payslipId, tenantId, payslipData, options = {}) => {
    const { browser: sharedBrowser } = options;

    try {
        // Load HTML template
        let template = await readFile(templatePath, "utf-8");

        const currency = payslipData.currency || "GMD";

        // Prepare template data (use passed company name so PDF shows actual company)
        const companyName =
            payslipData.companyName != null && String(payslipData.companyName).trim() !== ""
                ? String(payslipData.companyName).trim()
                : "Company Name";
        const templateData = {
            companyName,
            companyAddress: payslipData.companyAddress != null ? String(payslipData.companyAddress) : "",
            employeeId: payslipData.employeeId || "",
            employeeName: payslipData.employeeName || "",
            department: payslipData.department || "",
            position: payslipData.position || "",
            periodName: payslipData.periodName || "",
            startDate: payslipData.startDate || "",
            endDate: payslipData.endDate || "",
            paymentDate: payslipData.paymentDate || new Date().toLocaleDateString(),
            baseSalary: formatCurrency(payslipData.baseSalary || 0, currency),
            grossSalary: formatCurrency(payslipData.grossSalary || 0, currency),
            totalDeductions: formatCurrency(payslipData.totalDeductions || 0, currency),
            netSalary: formatCurrency(payslipData.netSalary || 0, currency),
            generatedAt: new Date().toLocaleString(),
        };

        // YTD section (year-to-date totals for current calendar year)
        const grossYTD = formatCurrency(payslipData.grossSalaryYTD ?? 0, currency);
        const deductionsYTD = formatCurrency(payslipData.totalDeductionsYTD ?? 0, currency);
        const netYTD = formatCurrency(payslipData.netSalaryYTD ?? 0, currency);
        const ytdSectionHTML = `
            <div class="breakdown-section ytd-section">
                <div class="section-title">Year to date</div>
                <table>
                    <tbody>
                        <tr>
                            <td>Gross salary YTD</td>
                            <td class="amount">${grossYTD}</td>
                        </tr>
                        <tr>
                            <td>Total deductions YTD</td>
                            <td class="amount">${deductionsYTD}</td>
                        </tr>
                        <tr class="total-row">
                            <td><strong>Net salary YTD</strong></td>
                            <td class="amount"><strong>${netYTD}</strong></td>
                        </tr>
                    </tbody>
                </table>
            </div>`;

        // Employer contributions section (for transparency; does not affect net pay)
        let employerSSHFCSectionHTML = "";
        const employerContributions = Array.isArray(payslipData.employerContributions)
            ? payslipData.employerContributions
            : [];
        const fallbackRate =
            payslipData.employerSSHFCRate != null && !Number.isNaN(Number(payslipData.employerSSHFCRate))
                ? Number(payslipData.employerSSHFCRate)
                : null;
        const fallbackAmount = payslipData.employerSSHFCAmount != null ? Number(payslipData.employerSSHFCAmount) : null;

        const linesToRender =
            employerContributions.length > 0
                ? employerContributions
                : fallbackRate != null && fallbackAmount != null
                  ? [{ name: "Employer SSHFC", amount: fallbackAmount }]
                  : [];

        if (linesToRender.length > 0) {
            const rows = linesToRender
                .map((line) => {
                    const name =
                        line?.name === "Employer SSHFC" && fallbackRate != null ? `Employer SSHFC (${fallbackRate}%)` : String(line?.name ?? "Employer contribution");
                    const amount = formatCurrency(line?.amount || 0, currency);
                    return `<tr><td>${name}</td><td class="amount">${amount}</td></tr>`;
                })
                .join("");
            employerSSHFCSectionHTML = `
            <div class="breakdown-section employer-section">
                <div class="section-title">Employer contribution</div>
                <table>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>`;
        }

        // Generate allowances HTML (name and amount only)
        let allowancesHTML = "";
        if (payslipData.allowances && payslipData.allowances.length > 0) {
            allowancesHTML = payslipData.allowances
                .map(
                    (allowance) => `
                <tr>
                    <td>${allowance.name || allowance.type || "Allowance"}</td>
                    <td class="amount">${formatCurrency(allowance.amount || 0, currency)}</td>
                </tr>
            `
                )
                .join("");
        } else {
            allowancesHTML = '<tr><td colspan="2" style="text-align: center; color: #999;">No allowances</td></tr>';
        }

        // Generate deductions HTML (name and amount only)
        let deductionsHTML = "";
        if (payslipData.deductions && payslipData.deductions.length > 0) {
            deductionsHTML = payslipData.deductions
                .map(
                    (deduction) => `
                <tr>
                    <td>${deduction.name || deduction.type || "Deduction"}</td>
                    <td class="amount">${formatCurrency(deduction.amount || 0, currency)}</td>
                </tr>
            `
                )
                .join("");
        } else {
            deductionsHTML = '<tr><td colspan="2" style="text-align: center; color: #999;">No deductions</td></tr>';
        }

        // Replace template placeholders
        template = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return templateData[key] !== undefined ? String(templateData[key]) : match;
        });
        template = template.replace("{{allowances}}", allowancesHTML);
        template = template.replace("{{deductions}}", deductionsHTML);
        template = template.replace("{{employerSSHFCSection}}", employerSSHFCSectionHTML);
        template = template.replace("{{ytdSection}}", ytdSectionHTML);

        let pdfBuffer;
        if (sharedBrowser) {
            pdfBuffer = await renderPayslipPdfBuffer(sharedBrowser, template);
        } else {
            pdfBuffer = await browserInstanceLimit(async () => {
                const browser = await launchBrowser();
                try {
                    return await renderPayslipPdfBuffer(browser, template);
                } finally {
                    await browser.close();
                }
            });
        }

        // Get year and month from pay period
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payslipData.payPeriodId,
                tenantId,
            },
        });

        const year = payPeriod?.calendarYear || new Date().getFullYear();
        const month = payPeriod?.calendarMonth || new Date().getMonth() + 1;

        // Upload to Cloudflare R2
        const uploadResult = await uploadPayslip(pdfBuffer, payslipId, tenantId, year, month);

        logger.info(`Generated and uploaded payslip PDF for ${payslipId}`, {
            payslipId,
            tenantId,
            publicId: uploadResult.public_id,
        });

        return uploadResult;
    } catch (error) {
        logger.error(`Error generating payslip PDF: ${error.message}`, {
            error: error.stack,
            payslipId,
            tenantId,
        });
        throw error;
    }
};

/**
 * Generate payslip PDF from payslip record
 * @param {string} payslipId - Payslip ID
 * @param {string} tenantId - Tenant ID
 * @param {{ browser?: import("puppeteer").Browser }} [options] - Optional shared browser (for batch use)
 * @returns {Promise<Object>} Upload result
 */
export const generatePayslipFromRecord = async (payslipId, tenantId, options = {}) => {
    try {
        const payslip = await prisma.payslip.findFirst({
            where: {
                id: payslipId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        departmentId: true,
                        positionId: true,
                    },
                },
                payrollRun: {
                    include: {
                        payPeriod: {
                            select: {
                                id: true,
                                periodName: true,
                                startDate: true,
                                endDate: true,
                                calendarYear: true,
                                calendarMonth: true,
                            },
                        },
                        tenant: {
                            select: { name: true, address: true, employerSocialSecurityRate: true },
                        },
                    },
                },
            },
        });

        if (!payslip) {
            throw new Error(`Payslip ${payslipId} not found`);
        }

        // Tenant (company) for PDF header – loaded via payrollRun.tenant so we always have the correct company
        const tenant = payslip.payrollRun?.tenant ?? null;

        // Get department and position names if available
        let department = "";
        let position = "";
        if (payslip.user.departmentId) {
            const dept = await prisma.department.findUnique({
                where: { id: payslip.user.departmentId },
                select: { name: true },
            });
            department = dept?.name || "";
        }
        if (payslip.user.positionId) {
            const pos = await prisma.position.findUnique({
                where: { id: payslip.user.positionId },
                select: { title: true },
            });
            position = pos?.title || "";
        }

        // Use snapshot if present so later config changes don't change this payslip's PDF; else recompute
        let breakdown;
        if (payslip.breakdownSnapshot != null) {
            breakdown = payslip.breakdownSnapshot;
        } else {
            breakdown = await getPayslipBreakdown(
                payslip.userId,
                tenantId,
                payslip.payrollRun.payPeriod.startDate,
                payslip.payrollRun.payPeriod.endDate
            );
        }

        const allowances = (breakdown.allowances || []).map((a) => ({
            name: a.name,
            amount: a.amount,
            description: a.description,
        }));

        const deductions = (breakdown.deductions || []).map((d) => ({
            name: d.name,
            amount: d.amount,
            description: d.description,
        }));

        // Prepare payslip data – use tenant name from DB so PDF shows actual company (never fallback unless missing)
        const rawCompanyName = tenant?.name;
        const companyName =
            typeof rawCompanyName === "string" && rawCompanyName.trim() !== ""
                ? rawCompanyName.trim()
                : "Company Name";
        const employerRate =
            breakdown?.employerSSHFCRate != null
                ? Number(breakdown.employerSSHFCRate)
                : tenant?.employerSocialSecurityRate != null
                  ? Number(tenant.employerSocialSecurityRate)
                  : null;
        const baseForEmployerSsn = Number(breakdown?.baseSalary) || 0;
        const employerSSHFCAmount =
            breakdown?.employerSSHFCAmount != null
                ? Number(breakdown.employerSSHFCAmount)
                : employerRate != null && !Number.isNaN(employerRate)
                  ? Math.round(baseForEmployerSsn * (employerRate / 100) * 100) / 100
                  : null;
        const ytd = await getPayslipYTD(
            payslip.userId,
            tenantId,
            payslip.payrollRun.payPeriod.endDate
        );
        const payslipData = {
            companyName,
            companyAddress: (tenant?.address && String(tenant.address).trim()) || "",
            employeeId: payslip.user.employeeId || "",
            employeeName: payslip.user.name || "",
            department,
            position,
            periodName: payslip.payrollRun.payPeriod.periodName || "",
            startDate: payslip.payrollRun.payPeriod.startDate.toLocaleDateString(),
            endDate: payslip.payrollRun.payPeriod.endDate.toLocaleDateString(),
            paymentDate: new Date().toLocaleDateString(),
            baseSalary: breakdown.baseSalary,
            grossSalary: payslip.grossSalary,
            totalDeductions: payslip.totalDeductions,
            netSalary: payslip.netSalary,
            allowances,
            deductions,
            payPeriodId: payslip.payrollRun.payPeriod.id,
            currency: breakdown.currency,
            employerSSHFCRate: employerRate,
            employerSSHFCAmount,
            employerContributions: Array.isArray(breakdown?.employerContributions) ? breakdown.employerContributions : undefined,
            grossSalaryYTD: ytd.grossSalaryYTD,
            totalDeductionsYTD: ytd.totalDeductionsYTD,
            netSalaryYTD: ytd.netSalaryYTD,
        };

        // Generate PDF (pass shared browser for batch)
        const uploadResult = await generatePayslipPDF(payslipId, tenantId, payslipData, options);

        // Update payslip record with file path
        await prisma.payslip.update({
            where: { id: payslipId },
            data: {
                filePath: uploadResult.public_id,
            },
        });

        return uploadResult;
    } catch (error) {
        logger.error(`Error generating payslip from record: ${error.message}`, {
            error: error.stack,
            payslipId,
            tenantId,
        });
        throw error;
    }
};

/**
 * Generate PDFs for multiple payslips using a single browser instance (much faster than N separate launches)
 * @param {string[]} payslipIds - Payslip IDs to generate
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Map<string, string>>} Map of payslipId -> filePath for successfully generated PDFs
 */
export const generatePayslipsBatch = async (payslipIds, tenantId) => {
    if (payslipIds.length === 0) return new Map();
    return browserInstanceLimit(async () => {
        let browser = null;
        const results = new Map();
        try {
            browser = await launchBrowser();
            for (const payslipId of payslipIds) {
                try {
                    const uploadResult = await generatePayslipFromRecord(payslipId, tenantId, { browser });
                    results.set(payslipId, uploadResult.public_id);
                } catch (err) {
                    logger.warn(`Failed to generate PDF for payslip ${payslipId} in batch: ${err.message}`);
                }
            }
        } finally {
            if (browser) {
                await browser.close();
            }
        }
        return results;
    });
};

