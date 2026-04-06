import { sendEmail } from "../services/resend.service.js";

export const sendPlatformAdminInviteEmail = async ({
  to,
  resetUrl,
  userName,
}) => {
  const subject = "You're invited as a platform admin - StaffLedger";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Platform Admin Invitation</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #2563eb; margin-top: 0;">You're invited to StaffLedger</h1>
        
        <p>Hi ${userName || "there"},</p>
        
        <p>You've been invited to join StaffLedger as a <strong>platform admin</strong>. Platform admins can manage companies and access the platform-wide dashboard.</p>
        
        <p>Click the button below to set your password and sign in. This link will take you to a secure page where you can create your password.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Set your password
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
        <p style="color: #666; font-size: 12px; word-break: break-all;">${resetUrl}</p>
        
        <p style="color: #dc2626; font-size: 14px; margin-top: 30px;">
          <strong>Important:</strong> This link will expire in 1 hour for security reasons.
        </p>
        
        <p style="color: #666; font-size: 14px;">
          If you didn't expect this invitation, you can safely ignore this email.
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
You're invited to StaffLedger

Hi ${userName || "there"},

You've been invited to join StaffLedger as a platform admin. Platform admins can manage companies and access the platform-wide dashboard.

Set your password and sign in by visiting this link:

${resetUrl}

This link will expire in 1 hour.

If you didn't expect this invitation, you can safely ignore this email.

This is an automated message from StaffLedger.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
