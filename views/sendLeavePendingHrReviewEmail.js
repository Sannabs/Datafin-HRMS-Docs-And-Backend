import { sendEmail } from "../services/resend.service.js";
import { escapeHtmlForEmail, renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";

export const sendLeavePendingHrReviewEmail = async ({
  to,
  hrName,
  employeeName,
  leaveTypeName,
  totalDays,
  formattedStartDate,
  formattedEndDate,
  requestUrl,
}) => {
  const subject = `Leave Request Pending Review - ${employeeName}`;

  const html = await renderEmailTemplate("email-leave-pending-hr-review", {
    hrName: escapeHtmlForEmail(hrName || "HR"),
    employeeName: escapeHtmlForEmail(employeeName),
    leaveTypeName: escapeHtmlForEmail(leaveTypeName),
    totalDays: escapeHtmlForEmail(totalDays.toFixed(1)),
    formattedStartDate: escapeHtmlForEmail(formattedStartDate),
    formattedEndDate: escapeHtmlForEmail(formattedEndDate),
    requestUrl,
  });

  const text = htmlToText(html);
  return await sendEmail({ to, subject, html, text });
};
