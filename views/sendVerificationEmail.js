import { sendEmail } from "../services/resend.service.js";

export const sendVerificationOTP = async ({ to, otp }) => {
  const subject = "Verify Your Email - StaffLedger";

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
        <h1 style="color: #2563eb; margin-top: 0;">Welcome to StaffLedger!</h1>
        
        <p>Hi there,</p>
        
        <p>Thank you for signing up! Please use the verification code below to complete your registration and start using StaffLedger.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <div style="display: inline-block; background-color: #ffffff; border: 2px solid #2563eb; padding: 20px 40px; border-radius: 8px;">
            <h2 style="color: #2563eb; font-size: 32px; letter-spacing: 8px; margin: 0; font-family: 'Courier New', monospace;">
              ${otp}
            </h2>
          </div>
        </div>
        
        <p style="color: #dc2626; font-size: 14px; margin-top: 20px;">
          <strong>Important:</strong> This code will expire in 5 minutes for security reasons.
        </p>
        
        <p style="color: #666; font-size: 14px; margin-top: 20px;">
          If you didn't create an account with StaffLedger, please ignore this email.
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
Welcome to StaffLedger!

Hi there,

Thank you for signing up! Please use the verification code below to complete your registration:

Your verification code is: ${otp}

This code will expire in 5 minutes.

If you didn't create an account with StaffLedger, please ignore this email.

This is an automated message from StaffLedger.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};

