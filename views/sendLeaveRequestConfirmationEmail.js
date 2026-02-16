import { sendEmail } from "../services/resend.service.js";

export const sendLeaveRequestConfirmationEmail = async ({
  to,
  employeeName,
  leaveTypeName,
  totalDays,
  formattedStartDate,
  formattedEndDate,
  reason,
}) => {
  const subject = `Leave Request Submitted - ${leaveTypeName}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Leave Request Submitted</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #10b981; margin-top: 0;">Leave Request Submitted Successfully</h1>
        
        <p>Hello ${employeeName},</p>
        
        <p>Your leave request has been submitted successfully and is now pending approval.</p>
        
        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Leave Type:</strong> ${leaveTypeName}</p>
          <p style="margin: 5px 0;"><strong>Duration:</strong> ${totalDays.toFixed(1)} day(s)</p>
          <p style="margin: 5px 0;"><strong>Start Date:</strong> ${formattedStartDate}</p>
          <p style="margin: 5px 0;"><strong>End Date:</strong> ${formattedEndDate}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #f59e0b;">Pending Manager Approval</span></p>
          ${reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>` : ""}
        </div>
        
        <p>You will be notified once your manager reviews the request.</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; margin: 0;">
          This is an automated message from Datafin HRMS. Please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
Leave Request Submitted Successfully

Hello ${employeeName},

Your leave request has been submitted successfully and is now pending approval.

Leave Type: ${leaveTypeName}
Duration: ${totalDays.toFixed(1)} day(s)
Start Date: ${formattedStartDate}
End Date: ${formattedEndDate}
Status: Pending Manager Approval
${reason ? `Reason: ${reason}` : ""}

You will be notified once your manager reviews the request.

This is an automated message from Datafin HRMS.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
