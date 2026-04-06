import { sendEmail } from "../services/resend.service.js";

/**
 * One email per cron run per user when new patrol sessions were created for them.
 */
export const sendPatrolSessionsScheduledEmail = async ({
  to,
  employeeName,
  rounds,
}) => {
  const subject =
    rounds.length === 1
      ? "Patrol round scheduled for you"
      : `${rounds.length} patrol rounds scheduled for you`;

  const rows = rounds
    .map(
      (r) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.siteName)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.scheduleName)}</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(r.slotLabel)}</td></tr>`
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #181C2E; margin-top: 0;">${subject}</h1>
        <p>Hello ${escapeHtml(employeeName)},</p>
        <p>New patrol session(s) were created for you by the schedule. Summary:</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#fff;border-radius:8px;">
          <thead><tr style="background:#FF7E0C22;">
            <th style="text-align:left;padding:8px;">Site</th>
            <th style="text-align:left;padding:8px;">Route</th>
            <th style="text-align:left;padding:8px;">Slot</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#666;font-size:14px;">Interval reminders will also appear in the app about 10 minutes before each round starts.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; margin: 0;">This is an automated message from StaffLedger.</p>
      </div>
    </body>
    </html>
  `;

  const textLines = rounds.map(
    (r) => `- ${r.siteName} / ${r.scheduleName}: ${r.slotLabel}`
  );
  const text = `${subject}\n\nHello ${employeeName},\n\n${textLines.join("\n")}\n\n— StaffLedger`;

  return sendEmail({ to, subject, html, text });
};

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
