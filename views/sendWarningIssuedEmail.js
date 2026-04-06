import { sendEmail } from "../services/resend.service.js";

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
  const name = employeeName || "there";
  const hasAttachment = Array.isArray(attachments) && attachments.length > 0;

  const bodyParagraphs = hasAttachment
    ? `<p>A formal warning letter has been issued to you and is attached to this message. Please review the document carefully.</p>
        <p>Kindly sign in to the StaffLedger mobile app to acknowledge the letter and take the required action.</p>`
    : `<p>A formal warning letter has been issued to you. Please review the document carefully.</p>
        <p>Kindly sign in to the StaffLedger mobile app to acknowledge the letter and take the required action.</p>`;

  const textBody = hasAttachment
    ? `A formal warning letter has been issued to you and is attached to this message. Please review the document carefully.

Kindly sign in to the StaffLedger mobile app to acknowledge the letter and take the required action.`
    : `A formal warning letter has been issued to you. Please review the document carefully.

Kindly sign in to the StaffLedger mobile app to acknowledge the letter and take the required action.`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Formal Warning Issued</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #b45309; margin-top: 0;">Formal Warning Issued</h1>
        <p>Hello ${name},</p>
        ${bodyParagraphs}
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; margin: 0;">
          This is an automated notification from StaffLedger.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
Formal Warning Issued

Hello ${name},

${textBody}

This is an automated notification from StaffLedger.
  `.trim();

  await sendEmail({
    to,
    subject,
    html,
    text,
    ...(hasAttachment && { attachments }),
  });
};
