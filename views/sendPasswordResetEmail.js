import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

export const sendPasswordResetEmail = async ({
  to,
  resetUrl,
  userName,
}) => {
  const subject = "Reset Your Password - StaffLedger";

  const html = await renderEmailTemplate("email-password-reset", {
    userName: escapeHtmlForEmail(userName || "there"),
    resetUrl,
  });

  const text = htmlToText(html);

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
