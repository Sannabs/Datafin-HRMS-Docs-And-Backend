import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

export const sendLeaveEndingReminderEmail = async ({
  to,
  employeeName,
  leaveTypeName,
  totalDays,
  formattedStartDate,
  formattedEndDate,
  daysUntilEnd,
}) => {
  let subject;
  let emailTitle;

  if (daysUntilEnd === 0) {
    subject = `Reminder: Your Leave Ends Today - ${leaveTypeName}`;
    emailTitle = "Your Leave Ends Today";
  } else if (daysUntilEnd === 1) {
    subject = `Reminder: Your Leave Ends Tomorrow - ${leaveTypeName}`;
    emailTitle = "Your Leave Ends Tomorrow";
  } else {
    subject = `Reminder: Your Leave Ends in ${daysUntilEnd} Days - ${leaveTypeName}`;
    emailTitle = `Your Leave Ends in ${daysUntilEnd} Days`;
  }

  const html = await renderEmailTemplate("email-leave-ending-reminder", {
    emailTitle: escapeHtmlForEmail(emailTitle),
    employeeName: escapeHtmlForEmail(employeeName),
    leaveTypeName: escapeHtmlForEmail(leaveTypeName),
    totalDays: escapeHtmlForEmail(totalDays.toFixed(1)),
    formattedStartDate: escapeHtmlForEmail(formattedStartDate),
    formattedEndDate: escapeHtmlForEmail(formattedEndDate),
  });

  const text = htmlToText(html);

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
