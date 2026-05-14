import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

/**
 * GET /api/sshfc-remittances
 * List stored SSHFC remittance PDFs for the current tenant (newest first).
 */
export const listSshfcRemittances = async (req, res) => {
    try {
        const tenantId = req.effectiveTenantId ?? req.user.tenantId;

        if (!tenantId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Tenant context is required. Use impersonation or sign in as a tenant user.",
            });
        }

        const items = await prisma.sshfcRemittanceDocument.findMany({
            where: { tenantId },
            orderBy: { created: "desc" },
            include: {
                payrollRun: {
                    include: {
                        payPeriod: true,
                    },
                },
            },
        });

        const data = items.map((doc) => ({
            id: doc.id,
            name: doc.name,
            size: doc.size,
            created: doc.created,
            payrollRunId: doc.payrollRunId,
            payrollRun: doc.payrollRun
                ? {
                      id: doc.payrollRun.id,
                      runCode: doc.payrollRun.runCode,
                      status: doc.payrollRun.status,
                      payPeriod: doc.payrollRun.payPeriod
                          ? {
                                id: doc.payrollRun.payPeriod.id,
                                periodName: doc.payrollRun.payPeriod.periodName,
                                startDate: doc.payrollRun.payPeriod.startDate,
                                endDate: doc.payrollRun.payPeriod.endDate,
                                calendarMonth: doc.payrollRun.payPeriod.calendarMonth,
                                calendarYear: doc.payrollRun.payPeriod.calendarYear,
                                status: doc.payrollRun.payPeriod.status,
                            }
                          : null,
                  }
                : null,
        }));

        return res.status(200).json({
            success: true,
            data,
            count: data.length,
        });
    } catch (error) {
        logger.error(`Error listing SSHFC remittances: ${error.message}`, {
            error: error.stack,
            tenantId: req.effectiveTenantId ?? req.user?.tenantId,
        });
        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to list SSHFC remittances",
        });
    }
};
