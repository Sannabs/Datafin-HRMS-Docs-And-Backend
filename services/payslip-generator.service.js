import puppeteer from "puppeteer";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../utils/logger.js";
import { uploadPayslip } from "./file-storage.service.js";
import prisma from "../config/prisma.config.js";
import { getPayslipBreakdown, formatCurrency } from "../utils/payslip.utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatePath = process.env.PAYSLIP_TEMPLATE_PATH || join(__dirname, "../templates/payslip.html");

/**
 * Generate payslip PDF and upload to Cloudflare R2
 * @param {string} payslipId - Payslip ID
 * @param {string} tenantId - Tenant ID
 * @param {Object} payslipData - Payslip data for template
 * @returns {Promise<Object>} Upload result with filename (as public_id) and secure_url
 */
export const generatePayslipPDF = async (payslipId, tenantId, payslipData) => {
    let browser = null;
    try {
        // Load HTML template
        let template = await readFile(templatePath, "utf-8");

        const currency = payslipData.currency || "USD";

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

        // Generate allowances HTML (with optional description e.g. "10% of base")
        const cellWithDesc = (name, desc) =>
            desc
                ? `<td>${name}<br><span style="font-size:0.8em;color:#666">${desc}</span></td>`
                : `<td>${name}</td>`;
        let allowancesHTML = "";
        if (payslipData.allowances && payslipData.allowances.length > 0) {
            allowancesHTML = payslipData.allowances
                .map(
                    (allowance) => `
                <tr>
                    ${cellWithDesc(allowance.name || allowance.type || "Allowance", allowance.description)}
                    <td class="amount">${formatCurrency(allowance.amount || 0, currency)}</td>
                </tr>
            `
                )
                .join("");
        } else {
            allowancesHTML = '<tr><td colspan="2" style="text-align: center; color: #999;">No allowances</td></tr>';
        }

        // Generate deductions HTML (with optional description)
        let deductionsHTML = "";
        if (payslipData.deductions && payslipData.deductions.length > 0) {
            deductionsHTML = payslipData.deductions
                .map(
                    (deduction) => `
                <tr>
                    ${cellWithDesc(deduction.name || deduction.type || "Deduction", deduction.description)}
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

        // Launch Puppeteer browser (use installed Chrome on Render when set)
        const executablePath =
            process.env.PUPPETEER_EXECUTABLE_PATH ||
            (process.env.RENDER ? "/opt/render/project/.render/chrome/opt/google/chrome/google-chrome" : undefined);
        browser = await puppeteer.launch({
            headless: true,
            ...(executablePath && { executablePath }),
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });

        const page = await browser.newPage();
        await page.setContent(template, { waitUntil: "networkidle0" });

        // Generate PDF
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "20mm",
                right: "15mm",
                bottom: "20mm",
                left: "15mm",
            },
        });

        await browser.close();
        browser = null;

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
        if (browser) {
            await browser.close();
        }
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
 * @returns {Promise<Object>} Upload result
 */
export const generatePayslipFromRecord = async (payslipId, tenantId) => {
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
                            select: { name: true, address: true },
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
        };

        // Generate PDF
        const uploadResult = await generatePayslipPDF(payslipId, tenantId, payslipData);

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

