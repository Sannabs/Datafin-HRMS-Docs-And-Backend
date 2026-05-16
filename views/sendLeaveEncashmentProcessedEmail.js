import { sendEmail } from "../services/resend.service.js";
import { escapeHtmlForEmail, renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";

export const sendLeaveEncashmentProcessedEmail = async ({
  to,
  employeeName,
  previousYear,
  encashedDays,
  encashmentAmount,
  processedDate,
}) => {
  const subject = `Leave Encashment Processed — ${encashedDays.toFixed(1)} Day(s) for ${previousYear}`;

  const html = await renderEmailTemplate("email-leave-encashment-processed", {
    employeeName: escapeHtmlForEmail(employeeName),
    previousYear: escapeHtmlForEmail(String(previousYear)),
    encashedDays: escapeHtmlForEmail(encashedDays.toFixed(1)),
    encashmentAmount: escapeHtmlForEmail(encashmentAmount.toFixed(2)),
    processedDate: escapeHtmlForEmail(processedDate),
  });

  const text = htmlToText(html);
  return await sendEmail({ to, subject, html, text });
};
