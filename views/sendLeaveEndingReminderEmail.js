import { sendEmail } from "../services/resend.service.js";

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

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Leave Ending Reminder</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; padding: 30px; border-radius: 8px;">
        <h1 style="color: #f59e0b; margin-top: 0;">${emailTitle}</h1>
        
        <p>Hello ${employeeName},</p>
        
        <p>This is a reminder that your approved leave is ending soon.</p>
        
        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 5px 0;"><strong>Leave Type:</strong> ${leaveTypeName}</p>
          <p style="margin: 5px 0;"><strong>Duration:</strong> ${totalDays.toFixed(1)} day(s)</p>
          <p style="margin: 5px 0;"><strong>Start Date:</strong> ${formattedStartDate}</p>
          <p style="margin: 5px 0;"><strong>End Date:</strong> ${formattedEndDate}</p>
          <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #10b981;">Approved</span></p>
        </div>
        
        <p>Please ensure you're ready to return to work on ${formattedEndDate}.</p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; margin: 0;">
          This is an automated reminder from Datafin HRMS. Please do not reply to this email.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
${emailTitle}

Hello ${employeeName},

This is a reminder that your approved leave is ending soon.

Leave Type: ${leaveTypeName}
Duration: ${totalDays.toFixed(1)} day(s)
Start Date: ${formattedStartDate}
End Date: ${formattedEndDate}
Status: Approved

Please ensure you're ready to return to work on ${formattedEndDate}.

This is an automated reminder from Datafin HRMS.
  `;

  return await sendEmail({
    to,
    subject,
    html,
    text,
  });
};
