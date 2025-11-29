import { v2 as cloudinary } from "cloudinary";
import logger from "../utils/logger.js";

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const STORAGE_FOLDER = process.env.PAYSLIP_STORAGE_FOLDER || "payslips";

/**
 * Upload payslip PDF to Cloudinary
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @param {string} payslipId - Payslip ID
 * @param {string} tenantId - Tenant ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} Cloudinary upload result with public_id and secure_url
 */
export const uploadPayslip = async (pdfBuffer, payslipId, tenantId, year, month) => {
    try {
        const folderPath = `${STORAGE_FOLDER}/${tenantId}/${year}/${month}`;

        // Convert buffer to base64 data URI for Cloudinary
        const base64Data = pdfBuffer.toString("base64");
        const dataUri = `data:application/pdf;base64,${base64Data}`;

        const result = await cloudinary.uploader.upload(dataUri, {
            resource_type: "raw",
            folder: folderPath,
            public_id: payslipId,
            format: "pdf",
            type: "upload",
        });

        logger.info(`Uploaded payslip to Cloudinary: ${result.public_id}`, {
            payslipId,
            tenantId,
        });

        return {
            public_id: result.public_id,
            secure_url: result.secure_url,
            url: result.url,
        };
    } catch (error) {
        logger.error(`Error uploading payslip to Cloudinary: ${error.message}`, {
            error: error.stack,
            payslipId,
            tenantId,
        });
        throw error;
    }
};

/**
 * Get secure URL for payslip download
 * @param {string} publicId - Cloudinary public_id
 * @param {number} expiresIn - URL expiration in seconds (default: 1 hour)
 * @returns {string} Signed secure URL
 */
export const getPayslipUrl = (publicId, expiresIn = 3600) => {
    try {
        if (!publicId) {
            return null;
        }

        const url = cloudinary.url(publicId, {
            resource_type: "raw",
            secure: true,
            expires_at: Math.floor(Date.now() / 1000) + expiresIn,
            sign_url: true,
        });

        return url;
    } catch (error) {
        logger.error(`Error generating payslip URL: ${error.message}`, {
            error: error.stack,
            publicId,
        });
        throw error;
    }
};

/**
 * Get secure URL without expiration (for permanent access)
 * @param {string} publicId - Cloudinary public_id
 * @returns {string} Secure URL
 */
export const getSecureUrl = (publicId) => {
    try {
        if (!publicId) {
            return null;
        }

        return cloudinary.url(publicId, {
            resource_type: "raw",
            secure: true,
        });
    } catch (error) {
        logger.error(`Error generating secure URL: ${error.message}`, {
            error: error.stack,
            publicId,
        });
        throw error;
    }
};

/**
 * Delete payslip from Cloudinary
 * @param {string} publicId - Cloudinary public_id
 * @returns {Promise<Object>} Deletion result
 */
export const deletePayslip = async (publicId) => {
    try {
        if (!publicId) {
            return { result: "not_found" };
        }

        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: "raw",
        });

        logger.info(`Deleted payslip from Cloudinary: ${publicId}`, {
            result: result.result,
        });

        return result;
    } catch (error) {
        logger.error(`Error deleting payslip from Cloudinary: ${error.message}`, {
            error: error.stack,
            publicId,
        });
        throw error;
    }
};

