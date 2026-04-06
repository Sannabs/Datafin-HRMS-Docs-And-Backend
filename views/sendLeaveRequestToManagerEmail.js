import { sendEmail } from "../services/resend.service.js";

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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Leave Request</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #2563eb; margin-top: 0;">New Leave Request Pending Approval</h1>
        
        <p>Hello ${managerName || "Manager"},</p>
        
        <p><strong>${employeeName}</strong> has submitted a leave request that requires your approval.</p>
        
        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Leave Type:</strong> ${leaveTypeName}</p>
          <p style="margin: 5px 0;"><strong>Duration:</strong> ${totalDays.toFixed(1)} day(s)</p>
          <p style="margin: 5px 0;"><strong>Start Date:</strong> ${formattedStartDate}</p>
          <p style="margin: 5px 0;"><strong>End Date:</strong> ${formattedEndDate}</p>
          ${reason ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${reason}</p>` : ""}
        </div>
        
        <p style="margin-top: 30px;">
          <a href="${requestUrl}" 
             style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Review Leave Request
          </a>
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; margin: 0;">
          This is an automated message from StaffLedger. Please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
New Leave Request Pending Approval

Hello ${managerName || "Manager"},

${employeeName} has submitted a leave request that requires your approval.

Leave Type: ${leaveTypeName}
Duration: ${totalDays.toFixed(1)} day(s)
Start Date: ${formattedStartDate}
End Date: ${formattedEndDate}
${reason ? `Reason: ${reason}` : ""}

Please review and approve the request at: ${requestUrl}

This is an automated message from StaffLedger.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
