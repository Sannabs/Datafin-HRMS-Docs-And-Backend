import { sendEmail } from "../services/resend.service.js";

export const sendWarningIssuedEmail = async ({
  to,
  employeeName,
  warningTitle,
  severity,
  detailUrl,
}) => {
  const subject = `Formal warning issued — ${warningTitle}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Warning issued</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #b45309; margin-top: 0;">Formal warning issued</h1>
        <p>Hello ${employeeName || "there"},</p>
        <p>A formal warning titled <strong>${warningTitle}</strong> has been issued to you
        (severity: <strong>${severity}</strong>). Please sign in to Datafin HRMS to review the details and acknowledge receipt per your company process.</p>
        <p style="margin-top: 24px;">
          <a href="${detailUrl}"
             style="background-color: #b45309; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View warning
          </a>
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
Formal warning issued

Hello ${employeeName || "there"},

A formal warning titled "${warningTitle}" has been issued to you (severity: ${severity}).
Please sign in to Datafin HRMS to review the details.

${detailUrl}

This is an automated message from Datafin HRMS.
  `.trim();

  await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
