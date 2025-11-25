import { sendEmail } from "../services/resend.service.js";

export const sendVerificationEmail = async ({
  to,
  verificationUrl,
  token,
  userName,
}) => {
  const subject = "Verify Your Email - Datafin HRMS";

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #2563eb; margin-top: 0;">Welcome to Datafin HRMS!</h1>
        
        <p>Hi ${userName || "there"},</p>
        
        <p>Thank you for signing up! Please verify your email address to complete your registration and start using Datafin HRMS.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" 
             style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Verify Email Address
          </a>
        </div>
        
        <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
        <p style="color: #666; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          If you didn't create an account with Datafin HRMS, please ignore this email.
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
Welcome to Datafin HRMS!

Hi ${userName || "there"},

Thank you for signing up! Please verify your email address by clicking the link below:

${verificationUrl}

If you didn't create an account with Datafin HRMS, please ignore this email.

This is an automated message from Datafin HRMS.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};

