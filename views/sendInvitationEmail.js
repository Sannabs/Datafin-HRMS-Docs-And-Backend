import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

/**
 * Send invitation email to invitee with accept link (primary way to receive the invite).
 * @param {Object} opts
 * @param {string} opts.to - Invitee email
 * @param {string} opts.acceptLink - Full URL to accept-invite page (e.g. CLIENT_URL/accept-invite/{token})
 * @param {string} opts.tenantName - Name of the company/tenant they're invited to
 * @param {Date} opts.expiresAt - Invitation expiry date
 */
export const sendInvitationEmail = async ({
  to,
  acceptLink,
  tenantName,
  expiresAt,
}) => {
  const expiresFormatted = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })
    : "see link";

  const subject = `You're invited to join ${tenantName} - StaffLedger`;

  const html = await renderEmailTemplate("email-invitation", {
    tenantName: escapeHtmlForEmail(tenantName),
    acceptLink,
    expiresFormatted: escapeHtmlForEmail(expiresFormatted),
  });

  const text = htmlToText(html);

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
