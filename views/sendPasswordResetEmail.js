import { sendEmail } from "../services/resend.service.js";

export const sendPasswordResetEmail = async ({
  to,
  resetUrl,
  token,
  userName,
}) => {
  const subject = "Reset Your Password - Datafin HRMS";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #2563eb; margin-top: 0;">Password Reset Request</h1>
        
        <p>Hi ${userName || "there"},</p>
        
        <p>We received a request to reset your password for your Datafin HRMS account. Click the button below to create a new password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Reset Password
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
        <p style="color: #666; font-size: 12px; word-break: break-all;">${resetUrl}</p>
        
        <p style="color: #dc2626; font-size: 14px; margin-top: 30px;">
          <strong>Important:</strong> This link will expire in 1 hour for security reasons.
        </p>
        
        <p style="color: #666; font-size: 14px;">
          If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; margin: 0;">
          This is an automated message from Datafin HRMS. Please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
Password Reset Request

Hi ${userName || "there"},

We received a request to reset your password for your Datafin HRMS account. Click the link below to create a new password:

${resetUrl}

Important: This link will expire in 1 hour for security reasons.

If you didn't request a password reset, please ignore this email. Your password will remain unchanged.

This is an automated message from Datafin HRMS.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
