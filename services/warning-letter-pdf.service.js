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

/** Mirrors frontend `toSentenceCaseCategory` in WarningActionBar.tsx */
function toSentenceCaseCategory(category) {
    if (!category || !String(category).trim()) return "conduct/performance";
    return String(category).toLowerCase().replace(/_/g, "/");
}

/** Long date similar to date-fns `PPP` (locale) */
function formatIncidentDateLong(incidentDate) {
    if (!incidentDate) return "—";
    try {
        const d = incidentDate instanceof Date ? incidentDate : new Date(incidentDate);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("en-US", { dateStyle: "long" });
    } catch {
        return "—";
    }
}

/**
 * Issuance prose from the issue modal maps to `issueNote`; fall back to draft `reason`.
 * Mirrors product intent: text after "It has been observed that:".
 */
function observedSectionFromWarning(warning) {
    const fromIssue = warning.issueNote && String(warning.issueNote).trim();
    if (fromIssue) return fromIssue;
    const fromReason = warning.reason && String(warning.reason).trim();
    if (fromReason) return fromReason;
    return "—";
}

function escapeHtml(s) {
    if (s == null) return "—";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * Same structure as `buildIssueLetterBody` in frontend WarningActionBar.tsx.
 * @param {object} p
 */
function buildLetterBodyHtml(p) {
    const e = escapeHtml;
    const obsRaw = p.observedSection ?? "—";
    const obs = escapeHtml(obsRaw);

    return [
        `<p class="subject"><strong>Subject: Warning Letter</strong></p>`,
        `<p>Dear ${e(p.employeeName)},</p>`,
        `<p>This letter serves as a formal warning regarding your <strong>${e(p.categorySentence)}</strong> in the workplace.</p>`,
        `<p><strong>It has been observed that:</strong></p>`,
        `<div class="observed">${obs}</div>`,
        `<p>Incident date on record: <strong>${e(p.incidentDateFormatted)}</strong></p>`,
        `<p>This behaviour is not in accordance with our company policies and expectations.<br/>Policy reference: <strong>${e(p.policyReference)}</strong></p>`,
        `<p>You are hereby advised to take immediate corrective action. Failure to improve your <strong>${e(p.categorySentence)}</strong> may result in further disciplinary action, including but not limited to suspension or termination.</p>`,
        `<p>We encourage you to treat this matter seriously and make the necessary improvements.</p>`,
        `<p>Kindly acknowledge receipt of this letter in the StaffLedger mobile app.</p>`,
        `<div class="signature">`,
        `<p>Sincerely,</p>`,
        `<p><strong>${e(p.senderName)}</strong><br/>${e(p.senderPosition)}<br/>${e(p.companyName)}</p>`,
        `</div>`,
    ].join("\n");
}

/**
 * @param {object} options
 * @param {{ name?: string | null } | null} [options.tenant]
 * @param {{
 *   name?: string | null;
 *   employeeId?: string | null;
 *   position?: { title?: string | null } | null;
 *   department?: { name?: string | null } | null;
 * } | null} [options.subjectUser]
 * @param {import("@prisma/client").EmployeeWarning & {
 *   user?: unknown;
 *   issuedBy?: { name?: string | null; position?: { title?: string | null } | null } | null;
 * }} options.warning
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

    const issuer = warning.issuedBy;
    const senderName = issuer?.name?.trim() || "Human Resources";
    const senderPosition =
        issuer?.position?.title?.trim() || "Human Resources";

    const categorySentence = toSentenceCaseCategory(warning.category);
    const incidentDateFormatted = formatIncidentDateLong(warning.incidentDate);
    const policyRef = warning.policyReference?.trim() || "—";
    const observedSection = observedSectionFromWarning(warning);

    const letterBody = buildLetterBodyHtml({
        employeeName,
        categorySentence,
        observedSection,
        incidentDateFormatted,
        policyReference: policyRef,
        senderName,
        senderPosition,
        companyName,
    });

    const recordTitle = warning.title?.trim() || "Case";
    const issuedAtStr = warning.issuedAt
        ? warning.issuedAt.toISOString()
        : "Not issued";
    const generatedAtStr = new Date().toISOString();

    let html = template.replace("{{LETTER_BODY}}", letterBody.trim());
    html = html.replace(/\{\{recordTitle\}\}/g, escapeHtml(recordTitle));
    html = html.replace(/\{\{issuedAt\}\}/g, escapeHtml(issuedAtStr));
    html = html.replace(/\{\{generatedAt\}\}/g, escapeHtml(generatedAtStr));

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
