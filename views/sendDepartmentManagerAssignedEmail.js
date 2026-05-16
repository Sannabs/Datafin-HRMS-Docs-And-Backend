import { sendEmail } from "../services/resend.service.js";
import {
  escapeHtmlForEmail,
  renderEmailTemplate,
  htmlToText,
} from "../utils/email-template.utils.js";

/**
 * @param {Object} opts
 * @param {string} opts.to
 * @param {string} opts.employeeName
 * @param {string} opts.departmentName
 * @param {string} opts.tenantName
 */
export const sendDepartmentManagerAssignedEmail = async ({
  to,
  employeeName,
  departmentName,
  tenantName,
}) => {
  const subject = `You're now managing ${departmentName} - StaffLedger`;

  const clientUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : process.env.CLIENT_URL;
  const dashboardLink = `${clientUrl}/dashboard`;

  const html = await renderEmailTemplate("email-department-manager-assigned", {
    employeeName: escapeHtmlForEmail(employeeName || "there"),
    departmentName: escapeHtmlForEmail(departmentName),
    tenantName: escapeHtmlForEmail(tenantName),
    dashboardLink,
  });

  const text = htmlToText(html);

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
