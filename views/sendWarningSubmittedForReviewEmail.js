import { sendEmail } from "../services/resend.service.js";

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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Warning pending HR review</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #2563eb; margin-top: 0;">Warning submitted for HR review</h1>
        <p>Hello ${recipientName || "there"},</p>
        <p>A warning for <strong>${employeeName}</strong> titled <strong>${warningTitle}</strong> has been submitted and needs HR review before it can be issued.</p>
        <p style="margin-top: 24px;">
          <a href="${reviewUrl}"
             style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Review in Datafin HRMS
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
Warning submitted for HR review

Hello ${recipientName || "there"},

A warning for ${employeeName} titled "${warningTitle}" has been submitted and needs HR review.

${reviewUrl}

This is an automated message from Datafin HRMS.
  `.trim();

  await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
