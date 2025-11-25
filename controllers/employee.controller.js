import prisma from "../config/prisma.config.js";
import logger from "../utils/logger.js";

// get all employees
export const getAllEmployees = async (req, res) => {
    try {
        const { tenantId } = req.user;

        // tenant scope
        const where = {
            isDeleted: false,
            ...(tenantId && { tenantId }),
        };

        // Fetch all employees with related data
        const employees = await prisma.user.findMany({
            where,
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                        code: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Remove sensitive information (password) from response
        const sanitizedEmployees = employees.map((employee) => {
            const { password, ...employeeWithoutPassword } = employee;
            return employeeWithoutPassword;
        });

        logger.info(`Retrieved ${sanitizedEmployees.length} employees`);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployees,
            count: sanitizedEmployees.length,
        });
    } catch (error) {
        logger.error(`Error fetching employees: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch employees",
        });
    }
};

// get employee by id (current authenticated user)
export const getEmployeeById = async (req, res) => {
    try {
        const { id, tenantId } = req.user;

        if (!id) {
            return res.status(401).json({
                success: false,
                error: "Unauthorized",
                message: "User not authenticated",
            });
        }

        const where = {
            id,
            isDeleted: false,
            ...(tenantId && { tenantId }),
        };

        // Fetch employee with related data
        const employee = await prisma.user.findUnique({
            where,
            include: {
                department: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                        description: true,
                    },
                },
                position: {
                    select: {
                        id: true,
                        title: true,
                        code: true,
                    },
                },
                tenant: {
                    select: {
                        id: true,
                        name: true,
                        code: true,
                    },
                },
            },
        });

        if (!employee) {
            logger.warn(`Employee not found with ID: ${id}`);
            return res.status(404).json({
                success: false,
                error: "Not Found",
                message: "Employee not found",
            });
        }

        // Remove sensitive information (password) from response
        const { password, ...sanitizedEmployee } = employee;

        logger.info(`Retrieved employee with ID: ${id}`);

        return res.status(200).json({
            success: true,
            data: sanitizedEmployee,
        });
    } catch (error) {
        logger.error(`Error fetching employee by ID: ${error.message}`, {
            error: error.stack,
        });

        return res.status(500).json({
            success: false,
            error: "Internal Server Error",
            message: "Failed to fetch employee",
        });
    }
};

