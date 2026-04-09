import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

export const sendPlatformAdminInviteEmail = async ({
  to,
  resetUrl,
  userName,
}) => {
  const subject = "You're invited as a platform admin - StaffLedger";

  const html = await renderEmailTemplate("email-platform-admin-invite", {
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
