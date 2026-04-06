import puppeteer from "puppeteer";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatePath =
    process.env.WARNING_LETTER_TEMPLATE_PATH ||
    join(__dirname, "../templates/warning-letter.html");

function escapeHtml(s) {
    if (s == null) return "—";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function applyTemplate(template, vars) {
    let html = template;
    for (const [key, val] of Object.entries(vars)) {
        const re = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        html = html.replace(re, escapeHtml(val));
    }
    return html;
}

/**
 * @param {object} options
 * @param {import("@prisma/client").Tenant | null} [options.tenant]
 * @param {{ name?: string | null; employeeId?: string | null }} [options.subjectUser]
 * @param {import("@prisma/client").EmployeeWarning} options.warning
 */
export async function generateWarningLetterPdfBuffer({ tenant, subjectUser, warning }) {
    let template;
    try {
        template = await readFile(templatePath, "utf-8");
    } catch (e) {
        logger.error(`generateWarningLetterPdfBuffer: template read failed: ${e.message}`);
        throw new Error("Warning letter template not found");
    }

    const companyName =
        tenant?.name && String(tenant.name).trim() !== ""
            ? String(tenant.name).trim()
            : "Organization";

    const employeeName = subjectUser?.name?.trim() || "Employee";
    const employeeCode = subjectUser?.employeeId?.trim() || subjectUser?.id?.slice(0, 8) || "—";

    const vars = {
        companyName,
        title: warning.title || "Case",
        employeeName,
        employeeCode,
        category: warning.category || "—",
        severity: warning.severity || "—",
        incidentDate: warning.incidentDate
            ? warning.incidentDate.toISOString().slice(0, 10)
            : "—",
        status: warning.status || "—",
        policyReference: warning.policyReference?.trim() || "—",
        reason: warning.reason?.trim() || "—",
        issuedAt: warning.issuedAt ? warning.issuedAt.toISOString() : "Not issued",
        generatedAt: new Date().toISOString(),
    };

    const html = applyTemplate(template, vars);

    const executablePath =
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        (process.env.RENDER
            ? "/opt/render/project/.render/chrome/opt/google/chrome/google-chrome"
            : undefined);

    const browser = await puppeteer.launch({
        headless: true,
        ...(executablePath && { executablePath }),
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        return await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "18mm",
                right: "15mm",
                bottom: "18mm",
                left: "15mm",
            },
        });
    } finally {
        await browser.close();
    }
}
