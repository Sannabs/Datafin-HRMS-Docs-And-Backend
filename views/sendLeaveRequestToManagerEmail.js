import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

export const sendLeaveRequestToManagerEmail = async ({
  to,
  managerName,
  employeeName,
  leaveTypeName,
  totalDays,
  formattedStartDate,
  formattedEndDate,
  reason,
  requestUrl,
}) => {
  const subject = `New Leave Request from ${employeeName} - Action Required`;

  const reasonBlock = reason
    ? `<p><strong>Reason:</strong> ${escapeHtmlForEmail(reason)}</p>`
    : "";

  const html = await renderEmailTemplate("email-leave-request-manager", {
    managerName: escapeHtmlForEmail(managerName || "Manager"),
    employeeName: escapeHtmlForEmail(employeeName),
    leaveTypeName: escapeHtmlForEmail(leaveTypeName),
    totalDays: escapeHtmlForEmail(totalDays.toFixed(1)),
    formattedStartDate: escapeHtmlForEmail(formattedStartDate),
    formattedEndDate: escapeHtmlForEmail(formattedEndDate),
    reasonBlock,
    requestUrl,
  });

  const text = htmlToText(html);

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
