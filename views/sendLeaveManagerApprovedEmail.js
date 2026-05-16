import { sendEmail } from "../services/resend.service.js";
import { escapeHtmlForEmail, renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";

export const sendLeaveManagerApprovedEmail = async ({
  to,
  employeeName,
  leaveTypeName,
  totalDays,
  formattedStartDate,
  formattedEndDate,
}) => {
  const subject = `Leave Request Manager Approved - ${leaveTypeName}`;

  const html = await renderEmailTemplate("email-leave-manager-approved", {
    employeeName: escapeHtmlForEmail(employeeName),
    leaveTypeName: escapeHtmlForEmail(leaveTypeName),
    totalDays: escapeHtmlForEmail(totalDays.toFixed(1)),
    formattedStartDate: escapeHtmlForEmail(formattedStartDate),
    formattedEndDate: escapeHtmlForEmail(formattedEndDate),
  });

  const text = htmlToText(html);
  return await sendEmail({ to, subject, html, text });
};
