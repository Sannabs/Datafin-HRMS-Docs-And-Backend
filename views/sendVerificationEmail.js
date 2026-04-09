import { sendEmail } from "../services/resend.service.js";
import { renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";

export const sendVerificationOTP = async ({ to, otp }) => {
  const subject = "Verify Your Email - StaffLedger";

  const html = await renderEmailTemplate("email-verification-otp", {
    otp: String(otp),
  });

  const text = htmlToText(html);

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
