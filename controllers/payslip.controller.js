import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";
import { getPayslipUrl, getPayslipBuffer } from "../services/file-storage.service.js";
import { addLog } from "../utils/audit.utils.js";
import { getPayslipBreakdown, formatCurrency } from "../utils/payslip.utils.js";
import { sendEmail } from "../services/resend.service.js";
import { renderEmailTemplate, htmlToText } from "../utils/email-template.utils.js";
import { calculatePayrollRunTotals } from "../services/payroll-run.service.js";
import archiver from "archiver";

/**
 * Get all payslips (HR Admin view) with search, filters, and pagination
 */
export const getAllPayslips = async (req, res) => {
    try {
        const { tenantId, id: userId } = req.user;
        const {
            search,
            payPeriodId,
            payrollRunId,
            departmentId,
            startDate,
            endDate,
            page = 1,
            limit = 20,
            sortBy = "generatedAt",
            sortOrder = "desc",
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const take = parseInt(limit);

        // Build where clause
        const where = {
            payrollRun: {
                tenantId,
            },
        };

        // Filter by payroll run
        if (payrollRunId) {
            where.payrollRunId = payrollRunId;
        }

        // Filter by pay period
        if (payPeriodId) {
            where.payrollRun = {
                ...where.payrollRun,
                payPeriodId,
            };
        }

        // Filter by department
        if (departmentId) {
            where.user = {
                departmentId,
            };
        }

        // Filter by date range
        if (startDate || endDate) {
            where.payrollRun = {
                ...where.payrollRun,
                payPeriod: {
                    ...(startDate && { startDate: { gte: new Date(startDate) } }),
                    ...(endDate && { endDate: { lte: new Date(endDate) } }),
                },
            };
        }

        // Search by employee name or ID
        if (search) {
            where.user = {
                ...where.user,
                OR: [
                    { name: { contains: search, mode: "insensitive" } },
                    { employeeId: { contains: search, mode: "insensitive" } },
                    { email: { contains: search, mode: "insensitive" } },
                ],
            };
        }

        // Build orderBy
        const orderBy = {};
        if (sortBy === "employeeName") {
            orderBy.user = { name: sortOrder };
        } else if (sortBy === "netSalary" || sortBy === "grossSalary") {
            orderBy[sortBy] = sortOrder;
        } else {
            orderBy.generatedAt = sortOrder;
        }

        // Get total count
        const totalCount = await prisma.payslip.count({ where });

        // Get payslips with pagination
        const payslips = await prisma.payslip.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        department: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        position: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
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
            orderBy,
            skip,
            take,
        });

        // Add download URLs
        const payslipsWithUrls = payslips.map((payslip) => ({
            ...payslip,
            downloadUrl: payslip.filePath ? getPayslipUrl(payslip.filePath) : null,
        }));

        // Log audit
        await addLog(userId, tenantId, "VIEW", "Payslip", "list", {
            filters: { search, payPeriodId, payrollRunId, departmentId, startDate, endDate },
            resultCount: payslips.length,
        }, req);

        logger.info(`Retrieved ${payslips.length} payslips for tenant ${tenantId}`);

        return res.status(200).json({
            success: true,
            data: payslipsWithUrls,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(totalCount / take),
            },
        });
    } catch (error) {
        logger.error(`Error fetching all payslips: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payslips",
        });
    }
};

/**
 * Get all payslips for a specific payroll run
 */
export const getPayslipsByPayrollRun = async (req, res) => {
    try {
        const { runId } = req.params;
        const { tenantId, id: userId } = req.user;
        const { includeBreakdown } = req.query;

        // Verify payroll run exists and belongs to tenant
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id: runId,
                tenantId,
            },
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
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        // Get all payslips for this run
        const payslips = await prisma.payslip.findMany({
            where: {
                payrollRunId: runId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        email: true,
                        department: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        position: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                user: {
                    name: "asc",
                },
            },
        });

        const payslipsWithDetails = await Promise.all(
            payslips.map(async (payslip) => {
                const result = {
                    ...payslip,
                    downloadUrl: payslip.filePath ? getPayslipUrl(payslip.filePath) : null,
                };

                if (includeBreakdown === "true") {
                    result.breakdown = await getPayslipBreakdown(
                        payslip.userId,
                        tenantId,
                        payrollRun.payPeriod.startDate,
                        payrollRun.payPeriod.endDate
                    );
                }

                return result;
            })
        );

        // Calculate summary
        const summary = {
            totalEmployees: payslips.length,
            totalGrossSalary: payslips.reduce((sum, p) => sum + p.grossSalary, 0),
            totalDeductions: payslips.reduce((sum, p) => sum + p.totalDeductions, 0),
            totalNetSalary: payslips.reduce((sum, p) => sum + p.netSalary, 0),
            totalAllowances: payslips.reduce((sum, p) => sum + p.totalAllowances, 0),
        };

        // Log audit
        await addLog(userId, tenantId, "VIEW", "Payslip", runId, {
            action: "view_payroll_run_payslips",
            payrollRunId: runId,
            count: payslips.length,
        }, req);

        logger.info(`Retrieved ${payslips.length} payslips for payroll run ${runId}`);

        return res.status(200).json({
            success: true,
            data: {
                payrollRun: {
                    id: payrollRun.id,
                    status: payrollRun.status,
                    runDate: payrollRun.runDate,
                    payPeriod: payrollRun.payPeriod,
                },
                payslips: payslipsWithDetails,
                summary,
            },
        });
    } catch (error) {
        logger.error(`Error fetching payslips for payroll run: ${error.message}`, {
            error: error.stack,
            runId: req.params.runId,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch payslips for payroll run",
        });
    }
};

/**
 * Bulk download all payslips for a payroll run as ZIP
 */
export const bulkDownloadPayslips = async (req, res) => {
    try {
        const { runId } = req.params;
        const { tenantId, id: userId } = req.user;

        // Verify payroll run exists and belongs to tenant
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id: runId,
                tenantId,
            },
            include: {
                payPeriod: {
                    select: {
                        periodName: true,
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

        // Get all payslips with file paths
        const payslips = await prisma.payslip.findMany({
            where: {
                payrollRunId: runId,
                filePath: { not: null },
            },
            include: {
                user: {
                    select: {
                        name: true,
                        employeeId: true,
                    },
                },
            },
        });

        if (payslips.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "No payslip PDFs found for this payroll run",
            });
        }

        // Set response headers for ZIP download (filename must be ASCII, no quotes/newlines)
        const safePeriodName = (payrollRun.payPeriod.periodName || "run")
            .replace(/[\s"\\\r\n]+/g, "-")
            .replace(/[^\w\-.]/g, "");
        const zipFilename = `payslips-${safePeriodName || "run"}.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename=${zipFilename}`);

        // Create archive
        const archive = archiver("zip", {
            zlib: { level: 9 },
        });

        // Pipe archive to response
        archive.pipe(res);

        // Add each payslip PDF to archive
        for (const payslip of payslips) {
            try {
                const pdfBuffer = await getPayslipBuffer(payslip.filePath);
                const filename = `${payslip.user.employeeId}-${payslip.user.name.replace(/\s+/g, "_")}.pdf`;
                archive.append(pdfBuffer, { name: filename });
            } catch (err) {
                logger.warn(`Failed to add payslip ${payslip.id} to ZIP: ${err.message}`);
            }
        }

        // Finalize archive
        await archive.finalize();

        // Log audit
        await addLog(userId, tenantId, "DOWNLOAD", "Payslip", runId, {
            action: "bulk_download",
            payrollRunId: runId,
            count: payslips.length,
        }, req);

        logger.info(`Bulk download initiated for payroll run ${runId} (${payslips.length} payslips)`);
    } catch (error) {
        logger.error(`Error bulk downloading payslips: ${error.message}`, {
            error: error.stack,
            runId: req.params.runId,
            tenantId: req.user?.tenantId,
        });

        if (!res.headersSent) {
            return res.status(500).json({
                success: false,
                error: "Internal Server Error",
                message: "Failed to create bulk download",
            });
        }
    }
};

/**
 * Export payslips to CSV or Excel
 */
export const exportPayslips = async (req, res) => {
    try {
        const { tenantId, id: userId } = req.user;
        const {
            format = "csv",
            payrollRunId,
            payPeriodId,
            startDate,
            endDate,
        } = req.body;

        // Build where clause
        const where = {
            payrollRun: {
                tenantId,
            },
        };

        if (payrollRunId) {
            where.payrollRunId = payrollRunId;
        }

        if (payPeriodId) {
            where.payrollRun = {
                ...where.payrollRun,
                payPeriodId,
            };
        }

        if (startDate || endDate) {
            where.payrollRun = {
                ...where.payrollRun,
                payPeriod: {
                    ...(startDate && { startDate: { gte: new Date(startDate) } }),
                    ...(endDate && { endDate: { lte: new Date(endDate) } }),
                },
            };
        }

        // Get payslips with all required data
        const payslips = await prisma.payslip.findMany({
            where,
            include: {
                user: {
                    select: {
                        employeeId: true,
                        name: true,
                        email: true,
                        department: {
                            select: { name: true },
                        },
                        position: {
                            select: { title: true },
                        },
                    },
                },
                payrollRun: {
                    include: {
                        payPeriod: {
                            select: {
                                periodName: true,
                                startDate: true,
                                endDate: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                { payrollRun: { payPeriod: { startDate: "desc" } } },
                { user: { name: "asc" } },
            ],
        });

        if (payslips.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "No payslips found matching the criteria",
            });
        }

        // Prepare export data
        const exportData = payslips.map((p) => ({
            "Employee ID": p.user.employeeId,
            "Employee Name": p.user.name,
            "Email": p.user.email,
            "Department": p.user.department?.name || "",
            "Position": p.user.position?.title || "",
            "Pay Period": p.payrollRun.payPeriod.periodName,
            "Period Start": p.payrollRun.payPeriod.startDate.toISOString().split("T")[0],
            "Period End": p.payrollRun.payPeriod.endDate.toISOString().split("T")[0],
            "Gross Salary": p.grossSalary.toFixed(2),
            "Total Allowances": p.totalAllowances.toFixed(2),
            "Total Deductions": p.totalDeductions.toFixed(2),
            "Net Salary": p.netSalary.toFixed(2),
            "Generated At": p.generatedAt.toISOString(),
        }));

        if (format === "csv") {
            // Generate CSV
            const headers = Object.keys(exportData[0]);
            const csvRows = [
                headers.join(","),
                ...exportData.map((row) =>
                    headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(",")
                ),
            ];
            const csvContent = csvRows.join("\n");

            res.setHeader("Content-Type", "text/csv");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="payslips-export-${new Date().toISOString().split("T")[0]}.csv"`
            );

            // Log audit
            await addLog(userId, tenantId, "EXPORT", "Payslip", "export", {
                format: "csv",
                count: payslips.length,
                filters: { payrollRunId, payPeriodId, startDate, endDate },
            }, req);

            return res.send(csvContent);
        } else if (format === "json") {
            // Return JSON format
            res.setHeader("Content-Type", "application/json");
            res.setHeader(
                "Content-Disposition",
                `attachment; filename="payslips-export-${new Date().toISOString().split("T")[0]}.json"`
            );

            // Log audit
            await addLog(userId, tenantId, "EXPORT", "Payslip", "export", {
                format: "json",
                count: payslips.length,
                filters: { payrollRunId, payPeriodId, startDate, endDate },
            }, req);

            return res.json({
                exportedAt: new Date().toISOString(),
                totalRecords: exportData.length,
                data: exportData,
            });
        } else {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Invalid format. Supported formats: csv, json",
            });
        }
    } catch (error) {
        logger.error(`Error exporting payslips: ${error.message}`, {
            error: error.stack,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to export payslips",
        });
    }
};

export const getPayslipById = async (req, res) => {
    try {
        const { id } = req.params;
        const { tenantId, id: userId, role } = req.user;
        const { includeBreakdown } = req.query;

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
                        email: true,
                        department: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                        position: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
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

        // Check if staff or department admin can only see their own payslips
        if ((role === "STAFF" || role === "DEPARTMENT_ADMIN") && payslip.userId !== userId) {
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

        let breakdown = null;
        if (includeBreakdown !== "false") {
            breakdown = await getPayslipBreakdown(
                payslip.userId,
                tenantId,
                payslip.payrollRun.payPeriod.startDate,
                payslip.payrollRun.payPeriod.endDate
            );
        }

        // Log audit
        await addLog(userId, tenantId, "VIEW", "Payslip", id, {
            action: "view_payslip",
            employeeId: payslip.user.employeeId,
        }, req);

        logger.info(`Retrieved payslip ${id} for user ${userId}`);

        return res.status(200).json({
            success: true,
            data: {
                ...payslip,
                downloadUrl,
                breakdown,
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
                        employeeId: true,
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

        // Check if staff or department admin can only see their own payslips
        if ((role === "STAFF" || role === "DEPARTMENT_ADMIN") && payslip.userId !== userId) {
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

        // Log audit for download
        await addLog(userId, tenantId, "DOWNLOAD", "Payslip", id, {
            employeeId: payslip.user.employeeId,
        }, req);

        // Stream PDF from R2 through backend (same as bulk download) so browser never hits R2 directly
        const pdfBuffer = await getPayslipBuffer(payslip.filePath);
        const safeName = `payslip-${payslip.user.employeeId || id.slice(0, 8)}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
        return res.send(pdfBuffer);
    } catch (error) {
        logger.error(`Error downloading payslip: ${error.message}`, {
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
        const { payPeriodId, startDate, endDate, includeBreakdown } = req.query;

        // Check if employee can only see their own payslips
        if ((role === "STAFF" || role === "DEPARTMENT_ADMIN") && employeeId !== userId) {
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
                employeeId: true,
                name: true,
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

        // Add download URLs and optionally itemized breakdown
        const payslipsWithDetails = await Promise.all(
            payslips.map(async (payslip) => {
                const result = {
                    ...payslip,
                    downloadUrl: payslip.filePath ? getPayslipUrl(payslip.filePath) : null,
                };

                if (includeBreakdown === "true") {
                    result.breakdown = await getPayslipBreakdown(
                        payslip.userId,
                        tenantId,
                        payslip.payrollRun.payPeriod.startDate,
                        payslip.payrollRun.payPeriod.endDate
                    );
                }

                return result;
            })
        );

        // Log audit
        await addLog(userId, tenantId, "VIEW", "Payslip", employeeId, {
            action: "view_employee_payslips",
            employeeId: employee.employeeId,
            count: payslips.length,
        }, req);

        logger.info(`Retrieved ${payslips.length} payslips for employee ${employeeId}`);

        return res.status(200).json({
            success: true,
            data: payslipsWithDetails,
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

/**
 * Distribute payslips via email for a payroll run
 */
export const distributePayslips = async (req, res) => {
    try {
        const { runId } = req.params;
        const { tenantId, id: userId } = req.user;
        const { employeeIds } = req.body;

        // Verify payroll run exists and belongs to tenant
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id: runId,
                tenantId,
            },
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
        });

        if (!payrollRun) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Payroll run not found",
            });
        }

        // Only allow distribution for completed payroll runs
        if (payrollRun.status !== "COMPLETED") {
            return res.status(400).json({
                success: false,
                error: "Bad Request",
                message: "Can only distribute payslips for completed payroll runs",
            });
        }

        // Get tenant info for company name
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true },
        });

        // Build where clause for payslips
        const payslipWhere = {
            payrollRunId: runId,
        };

        // If specific employee IDs provided, filter by them
        if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
            payslipWhere.userId = { in: employeeIds };
        }

        // Get all payslips for this run
        const payslips = await prisma.payslip.findMany({
            where: payslipWhere,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true,
                    },
                },
            },
        });

        if (payslips.length === 0) {
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "No payslips found for distribution",
            });
        }

        // Track distribution results
        const results = {
            total: payslips.length,
            sent: 0,
            failed: 0,
            skipped: 0,
            details: [],
        };

        // Send emails to each employee (with payslip PDF attached)
        for (const payslip of payslips) {
            try {
                // Skip if no email
                if (!payslip.user.email) {
                    results.skipped++;
                    results.details.push({
                        employeeId: payslip.user.employeeId,
                        name: payslip.user.name,
                        status: "skipped",
                        reason: "No email address",
                    });
                    continue;
                }

                // Skip if no PDF generated yet
                if (!payslip.filePath) {
                    results.skipped++;
                    results.details.push({
                        employeeId: payslip.user.employeeId,
                        name: payslip.user.name,
                        status: "skipped",
                        reason: "No payslip PDF available",
                    });
                    continue;
                }

                // Get PDF buffer for attachment
                let attachments = [];
                try {
                    const pdfBuffer = await getPayslipBuffer(payslip.filePath);
                    const safePeriodName = (payrollRun.payPeriod.periodName || "payslip")
                        .replace(/[\s"\\\r\n]+/g, "-")
                        .replace(/[^\w\-.]/g, "") || "payslip";
                    attachments = [
                        { filename: `Payslip-${safePeriodName}.pdf`, content: pdfBuffer },
                    ];
                } catch (bufferError) {
                    results.failed++;
                    results.details.push({
                        employeeId: payslip.user.employeeId,
                        name: payslip.user.name,
                        email: payslip.user.email,
                        status: "failed",
                        reason: bufferError.message || "Could not load payslip PDF",
                    });
                    logger.warn(`Could not load PDF for payslip ${payslip.id}: ${bufferError.message}`);
                    continue;
                }

                // Get salary structure for currency
                const breakdown = await getPayslipBreakdown(
                    payslip.userId,
                    tenantId,
                    payrollRun.payPeriod.startDate,
                    payrollRun.payPeriod.endDate
                );

                // Prepare email data
                const emailData = {
                    employeeName: payslip.user.name || "Employee",
                    periodName: payrollRun.payPeriod.periodName,
                    payDate: new Date().toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                    }),
                    grossSalary: formatCurrency(payslip.grossSalary, breakdown.currency),
                    totalDeductions: formatCurrency(payslip.totalDeductions, breakdown.currency),
                    netSalary: formatCurrency(payslip.netSalary, breakdown.currency),
                    companyName: tenant?.name || "Your Company",
                };

                // Render email template
                const html = await renderEmailTemplate("payslip-distribution", emailData);
                const text = htmlToText(html);

                // Send email with payslip PDF attached
                await sendEmail({
                    to: payslip.user.email,
                    subject: `Your Payslip for ${payrollRun.payPeriod.periodName} is Ready`,
                    html,
                    text,
                    attachments,
                });

                results.sent++;
                results.details.push({
                    employeeId: payslip.user.employeeId,
                    name: payslip.user.name,
                    email: payslip.user.email,
                    status: "sent",
                });

                logger.info(`Payslip email sent to ${payslip.user.email}`, {
                    payslipId: payslip.id,
                    employeeId: payslip.user.employeeId,
                });
            } catch (emailError) {
                results.failed++;
                results.details.push({
                    employeeId: payslip.user.employeeId,
                    name: payslip.user.name,
                    email: payslip.user.email,
                    status: "failed",
                    reason: emailError.message,
                });

                logger.error(`Failed to send payslip email to ${payslip.user.email}: ${emailError.message}`, {
                    error: emailError.stack,
                    payslipId: payslip.id,
                });
            }
        }

        // Log audit
        await addLog(userId, tenantId, "DISTRIBUTE", "Payslip", runId, {
            payrollRunId: runId,
            periodName: payrollRun.payPeriod.periodName,
            total: results.total,
            sent: results.sent,
            failed: results.failed,
            skipped: results.skipped,
        }, req);

        logger.info(`Payslip distribution completed for run ${runId}`, {
            total: results.total,
            sent: results.sent,
            failed: results.failed,
            skipped: results.skipped,
        });

        return res.status(200).json({
            success: true,
            message: `Payslip distribution completed. ${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped.`,
            data: results,
        });
    } catch (error) {
        logger.error(`Error distributing payslips: ${error.message}`, {
            error: error.stack,
            runId: req.params.runId,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to distribute payslips",
        });
    }
};

/**
 * Get distribution status/report for a payroll run
 */
export const getDistributionReport = async (req, res) => {
    try {
        const { runId } = req.params;
        const { tenantId } = req.user;

        // Verify payroll run exists and belongs to tenant
        const payrollRun = await prisma.payrollRun.findFirst({
            where: {
                id: runId,
                tenantId,
            },
            include: {
                payPeriod: {
                    select: {
                        periodName: true,
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

        // Get all payslips for this run
        const payslips = await prisma.payslip.findMany({
            where: {
                payrollRunId: runId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        employeeId: true,
                    },
                },
            },
        });

        // Get audit logs for distribution and downloads
        const distributionLogs = await prisma.auditLog.findMany({
            where: {
                tenantId,
                entityType: "Payslip",
                entityId: runId,
                action: "DISTRIBUTE",
            },
            orderBy: {
                timestamp: "desc",
            },
            take: 10,
        });

        // Get download logs for individual payslips
        const payslipIds = payslips.map((p) => p.id);
        const downloadLogs = await prisma.auditLog.findMany({
            where: {
                tenantId,
                entityType: "Payslip",
                entityId: { in: payslipIds },
                action: "DOWNLOAD",
            },
            select: {
                entityId: true,
                userId: true,
                timestamp: true,
            },
        });

        // Create a map of payslip downloads
        const downloadMap = {};
        downloadLogs.forEach((log) => {
            if (!downloadMap[log.entityId]) {
                downloadMap[log.entityId] = [];
            }
            downloadMap[log.entityId].push({
                userId: log.userId,
                timestamp: log.timestamp,
            });
        });

        // Build report
        const report = payslips.map((payslip) => ({
            employeeId: payslip.user.employeeId,
            name: payslip.user.name,
            email: payslip.user.email,
            payslipId: payslip.id,
            hasEmail: !!payslip.user.email,
            hasPdf: !!payslip.filePath,
            downloads: downloadMap[payslip.id] || [],
            downloadCount: (downloadMap[payslip.id] || []).length,
        }));

        // Summary stats
        const summary = {
            totalEmployees: payslips.length,
            withEmail: payslips.filter((p) => p.user.email).length,
            withPdf: payslips.filter((p) => p.filePath).length,
            totalDownloads: downloadLogs.length,
            uniqueDownloaders: new Set(downloadLogs.map((l) => l.userId)).size,
        };

        // Get last distribution info from audit logs
        const lastDistribution = distributionLogs.length > 0 ? distributionLogs[0] : null;

        return res.status(200).json({
            success: true,
            data: {
                payrollRun: {
                    id: payrollRun.id,
                    periodName: payrollRun.payPeriod.periodName,
                    status: payrollRun.status,
                },
                summary,
                lastDistribution: lastDistribution
                    ? {
                        timestamp: lastDistribution.timestamp,
                        details: lastDistribution.changes,
                    }
                    : null,
                employees: report,
            },
        });
    } catch (error) {
        logger.error(`Error fetching distribution report: ${error.message}`, {
            error: error.stack,
            runId: req.params.runId,
            tenantId: req.user?.tenantId,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch distribution report",
        });
    }
};

