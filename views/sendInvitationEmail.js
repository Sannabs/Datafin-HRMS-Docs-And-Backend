import { sendEmail } from "../services/resend.service.js";

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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invitation to join ${tenantName}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #2563eb; margin-top: 0;">You're invited to join ${tenantName}</h1>
        
        <p>Hi there,</p>
        
        <p>You have been invited to join <strong>${tenantName}</strong> on StaffLedger. Click the button below to accept the invitation and set up your account:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${acceptLink}" 
             style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Accept invitation
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
        <p style="color: #666; font-size: 12px; word-break: break-all;">${acceptLink}</p>
        
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          This invitation link expires on ${expiresFormatted}. If you did not expect this email, you can safely ignore it.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; margin: 0;">
          This is an automated message from StaffLedger. Please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
You're invited to join ${tenantName}

Hi there,

You have been invited to join ${tenantName} on StaffLedger. Open the link below to accept the invitation and set up your account:

${acceptLink}

This invitation link expires on ${expiresFormatted}. If you did not expect this email, you can safely ignore it.

This is an automated message from StaffLedger.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
