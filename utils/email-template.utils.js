import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import logger from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatesDir = join(__dirname, "../email-templates");

/**
 * Load and render an email template with data
 * @param {string} templateName - Name of the template file (without .html extension)
 * @param {Object} data - Data object to replace placeholders
 * @returns {Promise<string>} Rendered HTML
 */
export const renderEmailTemplate = async (templateName, data = {}) => {
    try {
        const templatePath = join(templatesDir, `${templateName}.html`);
        let template = await readFile(templatePath, "utf-8");

        // Replace all placeholders {{key}} with values from data object
        template = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return data[key] !== undefined ? String(data[key]) : match;
        });

        return template;
    } catch (error) {
        logger.error(`Error loading email template ${templateName}: ${error.message}`, {
            error: error.stack,
            templateName,
        });
        throw error;
    }
};

/**
 * Generate plain text version from HTML (simple conversion)
 * @param {string} html - HTML content
 * @returns {string} Plain text version
 */
export const htmlToText = (html) => {
    // Remove HTML tags and decode basic entities
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
};

