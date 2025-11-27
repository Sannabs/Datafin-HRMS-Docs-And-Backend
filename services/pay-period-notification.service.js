import sendEmail from "./resend.service.js";
import logger from "../utils/logger.js";
import prisma from "../config/prisma.config.js";
import { renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";

/**
 * Send email notification when pay period status changes automatically
 * @param {Object} payPeriod - Pay period object
 * @param {string} newStatus - New status
 * @param {string} tenantId - Tenant ID
 */
export const sendPayPeriodStatusChangeEmail = async (payPeriod, newStatus, tenantId) => {
    try {
        // Get HR admin emails for this tenant
        const hrAdmins = await prisma.user.findMany({
            where: {
                tenantId,
                role: "HR_ADMIN",
                isDeleted: false,
            },
            select: {
                email: true,
                name: true,
            },
        });

        if (hrAdmins.length === 0) {
            logger.warn(`No HR admins found for tenant ${tenantId} to send pay period status change email`);
            return;
        }

        const statusMessages = {
            PROCESSING: "has started processing",
            COMPLETED: "has been completed",
            CLOSED: "has been closed",
        };

        const message = statusMessages[newStatus] || `status changed to ${newStatus}`;

        const subject = `Pay Period ${payPeriod.periodName} ${message}`;

        const html = await renderEmailTemplate("pay-period-status-change", {
            periodName: payPeriod.periodName,
            statusMessage: message,
            startDate: new Date(payPeriod.startDate).toLocaleDateString(),
            endDate: new Date(payPeriod.endDate).toLocaleDateString(),
            status: newStatus,
        });

        const text = htmlToText(html);

        // Send to all HR admins
        for (const admin of hrAdmins) {
            try {
                await sendEmail({
                    to: admin.email,
                    subject,
                    html,
                    text,
                });
                logger.info(`Sent pay period status change email to ${admin.email}`);
            } catch (emailError) {
                logger.error(`Failed to send email to ${admin.email}: ${emailError.message}`);
            }
        }
    } catch (error) {
        logger.error(`Error sending pay period status change email: ${error.message}`, {
            error: error.stack,
            payPeriodId: payPeriod?.id,
            tenantId,
        });
    }
};

/**
 * Send email when all payroll runs complete
 * @param {Object} payPeriod - Pay period object
 * @param {string} tenantId - Tenant ID
 */
export const sendPayrollCompletionEmail = async (payPeriod, tenantId) => {
    try {
        // Get HR admin emails
        const hrAdmins = await prisma.user.findMany({
            where: {
                tenantId,
                role: "HR_ADMIN",
                isDeleted: false,
            },
            select: {
                email: true,
                name: true,
            },
        });

        if (hrAdmins.length === 0) {
            return;
        }

        // Get payroll run summary
        const payrollRuns = await prisma.payrollRun.findMany({
            where: {
                payPeriodId: payPeriod.id,
                tenantId,
            },
            select: {
                totalEmployees: true,
                totalGrossPay: true,
                totalNetPay: true,
            },
        });

        const totalEmployees = payrollRuns.reduce((sum, r) => sum + (r.totalEmployees || 0), 0);
        const totalGrossPay = payrollRuns.reduce((sum, r) => sum + (r.totalGrossPay || 0), 0);
        const totalNetPay = payrollRuns.reduce((sum, r) => sum + (r.totalNetPay || 0), 0);

        const subject = `Payroll Completed: ${payPeriod.periodName}`;

        const html = await renderEmailTemplate("payroll-completion", {
            periodName: payPeriod.periodName,
            totalEmployees: totalEmployees,
            totalGrossPay: totalGrossPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            totalNetPay: totalNetPay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        });

        const text = htmlToText(html);

        for (const admin of hrAdmins) {
            try {
                await sendEmail({
                    to: admin.email,
                    subject,
                    html,
                    text,
                });
                logger.info(`Sent payroll completion email to ${admin.email}`);
            } catch (emailError) {
                logger.error(`Failed to send email to ${admin.email}: ${emailError.message}`);
            }
        }
    } catch (error) {
        logger.error(`Error sending payroll completion email: ${error.message}`, {
            error: error.stack,
            payPeriodId: payPeriod?.id,
            tenantId,
        });
    }
};

/**
 * Send warning email before auto-closing pay period
 * @param {Object} payPeriod - Pay period object
 * @param {string} tenantId - Tenant ID
 * @param {number} hoursRemaining - Hours until auto-close
 */
export const sendAutoCloseWarningEmail = async (payPeriod, tenantId, hoursRemaining = 24) => {
    try {
        const hrAdmins = await prisma.user.findMany({
            where: {
                tenantId,
                role: "HR_ADMIN",
                isDeleted: false,
            },
            select: {
                email: true,
                name: true,
            },
        });

        if (hrAdmins.length === 0) {
            return;
        }

        const subject = `Pay Period ${payPeriod.periodName} Will Auto-Close Soon`;

        const html = await renderEmailTemplate("auto-close-warning", {
            periodName: payPeriod.periodName,
            status: payPeriod.status,
            hoursRemaining: hoursRemaining,
        });

        const text = htmlToText(html);

        for (const admin of hrAdmins) {
            try {
                await sendEmail({
                    to: admin.email,
                    subject,
                    html,
                    text,
                });
                logger.info(`Sent auto-close warning email to ${admin.email}`);
            } catch (emailError) {
                logger.error(`Failed to send email to ${admin.email}: ${emailError.message}`);
            }
        }
    } catch (error) {
        logger.error(`Error sending auto-close warning email: ${error.message}`, {
            error: error.stack,
            payPeriodId: payPeriod?.id,
            tenantId,
        });
    }
};

