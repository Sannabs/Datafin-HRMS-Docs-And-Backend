import { Resend } from "resend";
import logger from "../utils/logger.js";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.subject
 * @param {string} opts.html
 * @param {string} [opts.text]
 * @param {Array<{ filename: string; content: Buffer }>} [opts.attachments]
 */
export const sendEmail = async ({ to, subject, html, text, attachments }) => {
  try {
    const result = await resend.emails.send({
      from:
        process.env.RESEND_FROM_EMAIL || "Datafin HRMS <support@datafin.info>",
      to: [to],
      subject,
      html,
      ...(text && { text }),
      ...(attachments?.length && { attachments }),
    });

    logger.info(`Email sent successfully to ${to}:`, result.id);

    return { success: true, messageId: result.id };
  } catch (error) {
    logger.error(`Error sending email to ${to}:`, error.message);
    throw error;
  }
};

export default sendEmail;