import { uploadFile, deleteFile } from "../config/storage.config.js";
import logger from "../utils/logger.js";

const STORAGE_FOLDER = process.env.PAYSLIP_STORAGE_FOLDER || "payslips";

/**
 * Upload payslip PDF to Cloudflare R2
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} payslipId - Payslip ID
 * @param {string} tenantId - Tenant ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Upload result with filename (stored as public_id) and secure_url
 */
export const uploadPayslip = async (pdfBuffer, payslipId, tenantId, year, month) => {
    try {
        const folderPath = `${STORAGE_FOLDER}/${tenantId}/${year}/${month}`;
        const filename = `${folderPath}/${payslipId}.pdf`;

        // Upload to R2
        const publicUrl = await uploadFile(pdfBuffer, filename, "application/pdf");

        logger.info(`Uploaded payslip to R2: ${filename}`, {
            payslipId,
            tenantId,
        });

        // Return in compatible format (filename stored as public_id for backward compatibility)
        return {
            public_id: filename, // Store filename instead of Cloudinary public_id
            secure_url: publicUrl,
            url: publicUrl,
        };
    } catch (error) {
        logger.error(`Error uploading payslip to R2: ${error.message}`, {
            error: error.stack,
            payslipId,
            tenantId,
        });
        throw error;
    }
};

/**
 * Get secure URL for payslip download
 * @param {string} filename - File path/filename stored in filePath field
 * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
 * @returns {string} Public URL (R2 public URLs don't expire, but we keep the param for API compatibility)
 */
export const getPayslipUrl = (filename, expiresIn = 3600) => {
    try {
        if (!filename) {
            return null;
        }

        // If filename is already a full URL, return it
        if (filename.startsWith("http://") || filename.startsWith("https://")) {
            return filename;
        }

        // Construct public URL from filename
        const baseUrl = process.env.R2_PUBLIC_URL || "";
        const publicUrl = `${baseUrl}/${filename}`;

        // Note: R2 doesn't support signed URLs out of the box like S3
        // If you need signed URLs, you'll need to implement them via Cloudflare Workers
        // For now, we return the public URL
        return publicUrl;
    } catch (error) {
        logger.error(`Error generating payslip URL: ${error.message}`, {
            error: error.stack,
            filename,
        });
        throw error;
    }
};

/**
 * Get secure URL without expiration (for permanent access)
 * @param {string} filename - File path/filename
 * @returns {string} Public URL
 */
export const getSecureUrl = (filename) => {
    try {
        if (!filename) {
            return null;
        }

        // If filename is already a full URL, return it
        if (filename.startsWith("http://") || filename.startsWith("https://")) {
            return filename;
        }

        const baseUrl = process.env.R2_PUBLIC_URL || "";
        return `${baseUrl}/${filename}`;
    } catch (error) {
        logger.error(`Error generating secure URL: ${error.message}`, {
            error: error.stack,
            filename,
        });
        throw error;
    }
};

/**
 * Delete payslip from R2 storage
 * @param {string} filename - File path/filename stored in filePath field
 * @returns {Promise<Object>} Deletion result
 */
export const deletePayslip = async (filename) => {
    try {
        if (!filename) {
            return { result: "not_found" };
        }

        // Extract filename from URL if it's a full URL
        let fileKey = filename;
        if (filename.startsWith("http://") || filename.startsWith("https://")) {
            const url = new URL(filename);
            fileKey = url.pathname.substring(1); // Remove leading slash
        }

        await deleteFile(fileKey);

        logger.info(`Deleted payslip from R2: ${fileKey}`, {
            result: "ok",
        });

        return { result: "ok" };
    } catch (error) {
        logger.error(`Error deleting payslip from R2: ${error.message}`, {
            error: error.stack,
            filename,
        });
        throw error;
    }
};
