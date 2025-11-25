import { Resend } from "resend";
import logger from "../utils/logger.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const result = await resend.emails.send({
      from:
        process.env.RESEND_FROM_EMAIL || "Datafin HRMS <support@datafin.info>",
      to: [to], 
      subject: subject,
      html: html,
      ...(text && { text: text }),
    });

    logger.info(`✅ Email sent successfully to ${to}:`, result.id);

    return { success: true, messageId: result.id };
  } catch (error) {
    logger.error(`❌ Error sending email to ${to}:`, error.message);
    throw error;
  }
};

export default sendEmail;