import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
  } from "@aws-sdk/client-s3";
  import logger from "./logger.js";
  
  const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  
  /**
   * Upload a file to R2 storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} filename - File name with path
   * @param {string} contentType - MIME type (e.g., 'image/jpeg')
   * @returns {Promise<string>} Public URL of uploaded file
   */
  export const uploadFile = async (fileBuffer, filename, contentType) => {
    try {
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filename,
        Body: fileBuffer,
        ContentType: contentType,
      });
  
      await s3Client.send(command);
  
      // Construct public URL
      // Option 1: Use Cloudflare custom domain (recommended)
      // Option 2: Use R2 public URL (requires public bucket)
      const publicUrl = `${process.env.R2_PUBLIC_URL}/${filename}`;
  
      return publicUrl;
    } catch (error) {
      logger.error(`Error uploading file to R2: ${error.message}`);
      throw new Error("Failed to upload file");
    }
  };
  
  /**
   * Delete a file from R2 storage
   * @param {string} filename - File name with path
   */
  export const deleteFile = async (filename) => {
    try {
      const command = new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filename,
      });
  
      await s3Client.send(command);
      logger.info(`File deleted from R2: ${filename}`);
    } catch (error) {
      logger.error(`Error deleting file from R2: ${error.message}`);
      throw new Error("Failed to delete file");
    }
  };
  
  /**
   * Generate a unique filename
   * @param {string} originalName - Original file name
   * @param {string} folder - Folder path (e.g., 'products', 'users')
   * @returns {string} Unique filename
   */
  export const generateFilename = (originalName, folder = "uploads") => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split(".").pop();
    return `${folder}/${timestamp}-${randomString}.${extension}`;
  };
  
  /**
   * Extract filename from a full URL
   * @param {string} url - Full URL of the file
   * @returns {string} Filename with path (e.g., 'products/123-abc.jpg')
   */
  export const extractFilenameFromUrl = (url) => {
    try {
      // Remove the base URL and get the path
      const urlObj = new URL(url);
      // Remove leading slash
      return urlObj.pathname.substring(1);
    } catch (error) {
      // If URL parsing fails, try to extract from string
      const parts = url.split("/");
      return parts.slice(-2).join("/"); // Get last two parts (folder/filename)
    }
  };
  