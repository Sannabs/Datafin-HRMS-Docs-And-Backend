import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

/**
 * Optional email when a draft is submitted for HR review (in-app notify is primary).
 */
export const sendWarningSubmittedForReviewEmail = async ({
  to,
  recipientName,
  employeeName,
  warningTitle,
  reviewUrl,
}) => {
  const subject = `Warning pending review — ${employeeName}`;

  const html = await renderEmailTemplate("email-warning-submitted-review", {
    recipientName: escapeHtmlForEmail(recipientName || "there"),
    employeeName: escapeHtmlForEmail(employeeName),
    warningTitle: escapeHtmlForEmail(warningTitle),
    reviewUrl,
  });

  const text = htmlToText(html);

  await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
