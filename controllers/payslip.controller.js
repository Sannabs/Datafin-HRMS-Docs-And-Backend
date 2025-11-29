import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { getPayslipUrl } from "../services/file-storage.service.js";

export const getPayslipById = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, id: userId, role } = req.user;

        const payslip = await prisma.payslip.findFirst({
            where: {
                id,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        tenantId: true,
                    },
                },
                payrollRun: {
                    include: {
                        payPeriod: {
                            select: {
                                id: true,
                                periodName: true,
                                startDate: true,
                                endDate: true,
                            },
                        },
                    },
                },
            },
        });

        if (!payslip) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payslip not found",
            });
        }

        // Check tenant access
        if (payslip.user.tenantId !== tenantId) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "Access denied",
            });
        }

        // Check if employee can only see their own payslips
        if (role === "EMPLOYEE" && payslip.userId !== userId) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only access your own payslips",
            });
        }

        // Generate download URL if file exists
        let downloadUrl = null;
        if (payslip.filePath) {
            downloadUrl = getPayslipUrl(payslip.filePath);
        }

        logger.info(`Retrieved payslip ${id} for user ${userId}`);

        return res.status(200).json({
            success: true,
            data: {
                ...payslip,
                downloadUrl,
            },
        });
    } catch (error) {
        logger.error(`Error fetching payslip: ${error.message}`, {
            error: error.stack,
            payslipId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payslip",
        });
    }
};

export const downloadPayslip = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, id: userId, role } = req.user;

        const payslip = await prisma.payslip.findFirst({
            where: {
                id,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        tenantId: true,
                    },
                },
            },
        });

        if (!payslip) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payslip not found",
            });
        }

        // Check tenant access
        if (payslip.user.tenantId !== tenantId) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "Access denied",
            });
        }

        // Check if employee can only see their own payslips
        if (role === "EMPLOYEE" && payslip.userId !== userId) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only access your own payslips",
            });
        }

        if (!payslip.filePath) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payslip PDF not generated yet",
            });
        }

        // Generate secure URL and redirect
        const downloadUrl = getPayslipUrl(payslip.filePath, 3600); // 1 hour expiration

        logger.info(`Generated download URL for payslip ${id}`);

        return res.redirect(downloadUrl);
    } catch (error) {
        logger.error(`Error generating payslip download URL: ${error.message}`, {
            error: error.stack,
            payslipId: req.params.id,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to generate download URL",
        });
    }
};

export const getEmployeePayslips = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { tenantId, id: userId, role } = req.user;
        const { payPeriodId, startDate, endDate } = req.query;

        // Check if employee can only see their own payslips
        if (role === "EMPLOYEE" && employeeId !== userId) {
            return res.status(403).json({
                success: false,
                error: "Forbidden",
                message: "You can only access your own payslips",
            });
        }

        // Verify employee belongs to tenant
        const employee = await prisma.user.findFirst({
            where: {
                id: employeeId,
                tenantId,
            },
            select: {
                id: true,
            },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        const where = {
            userId: employeeId,
            payrollRun: {
                tenantId,
            },
            ...(payPeriodId && {
                payrollRun: {
                    payPeriodId,
                    tenantId,
                },
            }),
        };

        // If date range provided, filter by pay period dates
        if (startDate || endDate) {
            where.payrollRun = {
                ...where.payrollRun,
                payPeriod: {
                    ...(startDate && { startDate: { gte: new Date(startDate) } }),
                    ...(endDate && { endDate: { lte: new Date(endDate) } }),
                },
            };
        }

        const payslips = await prisma.payslip.findMany({
            where,
            include: {
                payrollRun: {
                    include: {
                        payPeriod: {
                            select: {
                                id: true,
                                periodName: true,
                                startDate: true,
                                endDate: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                generatedAt: "desc",
            },
        });

        // Add download URLs
        const payslipsWithUrls = payslips.map((payslip) => ({
            ...payslip,
            downloadUrl: payslip.filePath ? getPayslipUrl(payslip.filePath) : null,
        }));

        logger.info(`Retrieved ${payslips.length} payslips for employee ${employeeId}`);

        return res.status(200).json({
            success: true,
            data: payslipsWithUrls,
            count: payslips.length,
        });
    } catch (error) {
        logger.error(`Error fetching employee payslips: ${error.message}`, {
            error: error.stack,
            employeeId: req.params.employeeId,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch employee payslips",
        });
    }
};

