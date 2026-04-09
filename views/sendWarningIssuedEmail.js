import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

/**
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.employeeName
 * @param {Array<{ filename: string; content: Buffer }>} [opts.attachments] — when set, body mentions an attachment
 */
export const sendWarningIssuedEmail = async ({
  to,
  employeeName,
  attachments,
}) => {
  const subject = "Formal Warning Issued";
  const hasAttachment = Array.isArray(attachments) && attachments.length > 0;

  const bodyParagraphs = hasAttachment
    ? `<p>A formal warning letter has been issued to you and is attached to this message. Please review the document carefully.</p><p>Kindly sign in to the StaffLedger mobile app to acknowledge the letter and take the required action.</p>`
    : `<p>A formal warning letter has been issued to you. Please review the document carefully.</p><p>Kindly sign in to the StaffLedger mobile app to acknowledge the letter and take the required action.</p>`;

  const html = await renderEmailTemplate("email-warning-issued", {
    employeeName: escapeHtmlForEmail(employeeName || "there"),
    bodyParagraphs,
  });

  const text = htmlToText(html);

  await sendEmail({
    to,
    subject,
    html,
    text,
    ...(hasAttachment && { attachments }),
  });
};
