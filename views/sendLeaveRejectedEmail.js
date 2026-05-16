import { sendEmail } from "../services/resend.service.js";
import { escapeHtmlForEmail, renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";

export const sendLeaveRejectedEmail = async ({
  to,
  employeeName,
  leaveTypeName,
  totalDays,
  formattedStartDate,
  formattedEndDate,
  rejectionReason,
}) => {
  const subject = `Leave Request Rejected - ${leaveTypeName}`;

  const rejectionReasonBlock = rejectionReason
    ? `<p><strong>Reason:</strong> ${escapeHtmlForEmail(rejectionReason)}</p>`
    : "";

  const html = await renderEmailTemplate("email-leave-rejected", {
    employeeName: escapeHtmlForEmail(employeeName),
    leaveTypeName: escapeHtmlForEmail(leaveTypeName),
    totalDays: escapeHtmlForEmail(totalDays.toFixed(1)),
    formattedStartDate: escapeHtmlForEmail(formattedStartDate),
    formattedEndDate: escapeHtmlForEmail(formattedEndDate),
    rejectionReasonBlock,
  });

  const text = htmlToText(html);
  return await sendEmail({ to, subject, html, text });
};
