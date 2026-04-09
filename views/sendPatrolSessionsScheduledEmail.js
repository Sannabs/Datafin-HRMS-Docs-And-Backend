import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

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

  const patrolTableRows = rounds
    .map(
      (r) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeCell(
          r.siteName
        )}</td><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeCell(
          r.scheduleName
        )}</td><td style="padding:8px;border-bottom:1px solid #ddd;">${escapeCell(
          r.slotLabel
        )}</td></tr>`
    )
    .join("");

  const html = await renderEmailTemplate("email-patrol-sessions-scheduled", {
    emailHeading: escapeHtmlForEmail(subject),
    employeeName: escapeHtmlForEmail(employeeName),
    patrolTableRows,
  });

  const text = htmlToText(html);

  return sendEmail({ to, subject, html, text });
};

function escapeCell(s) {
  return escapeHtmlForEmail(s);
}
