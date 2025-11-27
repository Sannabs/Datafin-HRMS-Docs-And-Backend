import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { addLog } from "../utils/audit.utils.js";
import { processPayrollRun, processEmployeePayroll } from "../services/payroll-run.service.js";
import { updatePayPeriodStatusAutomatically } from "../services/pay-period-automation.service.js";

export const createPayrollRun = async (req, res) => {
    try {
        const { id: userId, tenantId } = req.user;
        const { payPeriodId, employeeIds } = req.body;

        if (!payPeriodId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "payPeriodId is required",
            });
        }

        // Verify pay period exists and belongs to tenant
        const payPeriod = await prisma.payPeriod.findFirst({
            where: {
                id: payPeriodId,
                tenantId,
            },
        });

        if (!payPeriod) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Pay period not found",
            });
        }

        // Check if pay period is in valid status for processing
        if (payPeriod.status === "CLOSED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot create payroll run for closed pay period",
            });
        }

        // Get employees to process (if not specified, get all active employees)
        let employeesToProcess = [];
        if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
            employeesToProcess = await prisma.user.findMany({
                where: {
                    id: { in: employeeIds },
                    tenantId,
                    isDeleted: false,
                    status: "ACTIVE",
                },
                select: { id: true },
            });
        } else {
            // Get all active employees with active salary structures
            employeesToProcess = await prisma.user.findMany({
                where: {
                    tenantId,
                    isDeleted: false,
                    status: "ACTIVE",
                },
                select: { id: true },
            });
        }

        if (employeesToProcess.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "No eligible employees found for payroll processing",
            });
        }

        // Create payroll run
        const payrollRun = await prisma.payrollRun.create({
            data: {
                tenantId,
                payPeriodId,
                processedBy: userId,
                status: "DRAFT",
                totalEmployees: 0,
            },
        });

        logger.info(`Created payroll run ${payrollRun.id} for pay period ${payPeriodId}`);
        await addLog(userId, tenantId, "CREATE", "PayrollRun", payrollRun.id, null, req);

        return res.status(201).json({
            success: true,
            data: payrollRun,
            message: "Payroll run created successfully",
        });
    } catch (error) {
        logger.error(`Error creating payroll run: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to create payroll run",
        });
    }
};

export const startPayrollRun = async (req, res) => {
    try {
        const { id } = req.params;
        const { id: userId, tenantId } = req.user;

        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                payPeriod: true,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        if (payrollRun.status !== "DRAFT") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: `Cannot start payroll run in ${payrollRun.status} status`,
            });
        }

        // Update run to PROCESSING
        const updated = await prisma.payrollRun.update({
            where: { id },
            data: {
                status: "PROCESSING",
                processedAt: new Date(),
            },
        });

        logger.info(`Started payroll run ${id}`);
        await addLog(userId, tenantId, "START_PAYROLL_RUN", "PayrollRun", id, {
            status: { before: "DRAFT", after: "PROCESSING" },
        }, req);

        // Automatically update pay period status to PROCESSING
        try {
            await updatePayPeriodStatusAutomatically(payrollRun.payPeriodId, tenantId, "PROCESSING");
        } catch (autoError) {
            logger.warn(`Failed to auto-update pay period status: ${autoError.message}`);
        }

        // Process payroll asynchronously (in production, use a job queue)
        processPayrollRunAsync(id, tenantId).catch((error) => {
            logger.error(`Error in async payroll processing: ${error.message}`, {
                error: error.stack,
                payrollRunId: id,
            });
        });

        return res.status(200).json({
            success: true,
            data: updated,
            message: "Payroll run started successfully. Processing in background.",
        });
    } catch (error) {
        logger.error(`Error starting payroll run: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to start payroll run",
        });
    }
};

// Async processing function
async function processPayrollRunAsync(payrollRunId, tenantId) {
    try {
        const payrollRun = await prisma.payrollRun.findUnique({
            where: { id: payrollRunId },
            include: {
                payPeriod: {
                    include: {
                        payrollRuns: true,
                    },
                },
            },
        });

        // Get all employees for this tenant
        const employees = await prisma.user.findMany({
            where: {
                tenantId,
                isDeleted: false,
                status: "ACTIVE",
            },
            select: { id: true },
        });

        const employeeIds = employees.map((e) => e.id);

        // Process payroll
        const results = await processPayrollRun(payrollRunId, employeeIds);

        // Update run status based on results
        const finalStatus = results.failed === 0 ? "COMPLETED" : "FAILED";

        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                status: finalStatus,
                totalEmployees: results.processed,
            },
        });

        logger.info(`Payroll run ${payrollRunId} ${finalStatus}. Processed: ${results.processed}, Failed: ${results.failed}`);

        // Automatically update pay period status
        try {
            await updatePayPeriodStatusAutomatically(payrollRun.payPeriodId, tenantId, null);
        } catch (autoError) {
            logger.warn(`Failed to auto-update pay period status: ${autoError.message}`);
        }
    } catch (error) {
        logger.error(`Error in async payroll processing: ${error.message}`, {
            error: error.stack,
            payrollRunId,
        });

        // Mark run as failed
        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                status: "FAILED",
            },
        });
    }
}

export const getPayrollRuns = async (req, res) => {
    try {
        const { tenantId } = req.user;
        const { payPeriodId, status } = req.query;

        const where = {
            tenantId,
            ...(payPeriodId && { payPeriodId }),
            ...(status && { status }),
        };

        const payrollRuns = await prisma.payrollRun.findMany({
            where,
            include: {
                payPeriod: {
                    select: {
                        id: true,
                        periodName: true,
                        startDate: true,
                        endDate: true,
                    },
                },
                processor: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                _count: {
                    select: {
                        payslips: true,
                    },
                },
            },
            orderBy: {
                runDate: "desc",
            },
        });

        logger.info(`Retrieved ${payrollRuns.length} payroll runs for tenant ${tenantId}`);

        return res.status(200).json({
            success: true,
            data: payrollRuns,
            count: payrollRuns.length,
        });
    } catch (error) {
        logger.error(`Error fetching payroll runs: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payroll runs",
        });
    }
};

export const getPayrollRunById = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId } = req.user;

        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                payPeriod: {
                    select: {
                        id: true,
                        periodName: true,
                        startDate: true,
                        endDate: true,
                        status: true,
                    },
                },
                processor: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                payslips: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                employeeId: true,
                            },
                        },
                    },
                    orderBy: {
                        netSalary: "desc",
                    },
                },
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        logger.info(`Retrieved payroll run ${id}`);

        return res.status(200).json({
            success: true,
            data: payrollRun,
        });
    } catch (error) {
        logger.error(`Error fetching payroll run: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payroll run",
        });
    }
};

export const processSingleEmployee = async (req, res) => {
    try {
        const { id: payrollRunId } = req.params;
        const { employeeId } = req.body;
        const { id: userId, tenantId } = req.user;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "employeeId is required",
            });
        }

        // Verify payroll run exists and belongs to tenant
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id: payrollRunId,
                tenantId,
            },
            include: {
                payPeriod: true,
            },
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        // Check if payroll run is in valid status
        if (payrollRun.status === "CLOSED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Cannot process employee for closed payroll run",
            });
        }

        // Check if employee already has a payslip in this run
        const existingPayslip = await prisma.payslip.findUnique({
            where: {
                payrollRunId_userId: {
                    payrollRunId,
                    userId: employeeId,
                },
            },
        });

        // Process employee payroll
        const payslipData = await processEmployeePayroll(
            employeeId,
            payrollRun.payPeriodId,
            tenantId
        );

        // Create or update payslip
        let payslip;
        if (existingPayslip) {
            // Update existing payslip
            payslip = await prisma.payslip.update({
                where: { id: existingPayslip.id },
                data: {
                    grossSalary: payslipData.grossSalary,
                    totalAllowances: payslipData.totalAllowances,
                    totalDeductions: payslipData.totalDeductions,
                    netSalary: payslipData.netSalary,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                        },
                    },
                },
            });
        } else {
            // Create new payslip
            payslip = await prisma.payslip.create({
                data: {
                    payrollRunId,
                    userId: employeeId,
                    grossSalary: payslipData.grossSalary,
                    totalAllowances: payslipData.totalAllowances,
                    totalDeductions: payslipData.totalDeductions,
                    netSalary: payslipData.netSalary,
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                        },
                    },
                },
            });
        }

        // Recalculate payroll run totals
        const allPayslips = await prisma.payslip.findMany({
            where: { payrollRunId },
            select: {
                grossSalary: true,
                totalDeductions: true,
                netSalary: true,
            },
        });

        const totalGrossPay = allPayslips.reduce((sum, p) => sum + p.grossSalary, 0);
        const totalDeductions = allPayslips.reduce((sum, p) => sum + p.totalDeductions, 0);
        const totalNetPay = allPayslips.reduce((sum, p) => sum + p.netSalary, 0);

        await prisma.payrollRun.update({
            where: { id: payrollRunId },
            data: {
                totalEmployees: allPayslips.length,
                totalGrossPay,
                totalDeductions,
                totalNetPay,
            },
        });

        logger.info(`Processed payroll for employee ${employeeId} in run ${payrollRunId}`);
        await addLog(
            userId,
            tenantId,
            existingPayslip ? "UPDATE" : "PROCESS",
            "Payslip",
            payslip.id,
            existingPayslip
                ? {
                    grossSalary: {
                        before: existingPayslip.grossSalary,
                        after: payslipData.grossSalary,
                    },
                    netSalary: {
                        before: existingPayslip.netSalary,
                        after: payslipData.netSalary,
                    },
                }
                : null,
            req
        );

        return res.status(200).json({
            success: true,
            data: payslip,
            message: existingPayslip
                ? "Employee payroll updated successfully"
                : "Employee payroll processed successfully",
        });
    } catch (error) {
        logger.error(`Error processing single employee payroll: ${error.message}`, {
            error: error.stack,
            payrollRunId: req.params.id,
            employeeId: req.body?.employeeId,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: error.message || "Failed to process employee payroll",
        });
    }
};

