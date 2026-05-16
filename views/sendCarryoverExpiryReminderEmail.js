import { sendEmail } from "../services/resend.service.js";
import { escapeHtmlForEmail, renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";

export const sendCarryoverExpiryReminderEmail = async ({
  to,
  employeeName,
  carriedOverDays,
  formattedExpiryDate,
  daysUntilExpiry,
}) => {
  const dayLabel = carriedOverDays.toFixed(1);
  const subject = `Action Required: ${dayLabel} Carryover Day(s) Expire in ${daysUntilExpiry} Days`;

  let urgencyIntro;
  if (daysUntilExpiry <= 7) {
    urgencyIntro = `This is an urgent reminder that your carried-over leave days will expire in <strong>${daysUntilExpiry} day(s)</strong> on <strong>${formattedExpiryDate}</strong>.`;
  } else if (daysUntilExpiry <= 14) {
    urgencyIntro = `Your carried-over leave days will expire in <strong>2 weeks</strong> on <strong>${formattedExpiryDate}</strong>.`;
  } else {
    urgencyIntro = `Your carried-over leave days will expire in <strong>${daysUntilExpiry} days</strong> on <strong>${formattedExpiryDate}</strong>.`;
  }

  const callToAction = `You have <strong>${dayLabel}</strong> carried-over day(s) that will be forfeited if not used. Please submit a leave request before <strong>${formattedExpiryDate}</strong>.`;

  const html = await renderEmailTemplate("email-leave-carryover-expiry-reminder", {
    employeeName: escapeHtmlForEmail(employeeName),
    urgencyIntro,
    carriedOverDays: escapeHtmlForEmail(dayLabel),
    formattedExpiryDate: escapeHtmlForEmail(formattedExpiryDate),
    daysUntilExpiry: escapeHtmlForEmail(String(daysUntilExpiry)),
    callToAction,
  });

  const text = htmlToText(html);
  return await sendEmail({ to, subject, html, text });
};
