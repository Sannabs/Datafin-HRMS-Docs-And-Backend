import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { getPayrollQueue, getEmployeeQueue } from "../queues/payroll.queue.js";
import logger from "../utils/logger.js";

let serverAdapter = null;

/**
 * Create and configure Bull Board dashboard
 * @returns {ExpressAdapter} Express adapter for Bull Board
 */
export const createBullBoardDashboard = () => {
    if (serverAdapter) {
        return serverAdapter;
    }

    try {
        serverAdapter = new ExpressAdapter();
        serverAdapter.setBasePath("/admin/queues");

        const payrollQueue = getPayrollQueue();
        const employeeQueue = getEmployeeQueue();

        createBullBoard({
            queues: [
                new BullMQAdapter(payrollQueue),
                new BullMQAdapter(employeeQueue),
            ],
            serverAdapter,
            options: {
                uiConfig: {
                    boardTitle: "Datafin HRMS - Payroll Queue Dashboard",
                    boardLogo: {
                        path: "",
                        width: "100px",
                        height: "auto",
                    },
                    miscLinks: [
                        { text: "API Docs", url: "/api-docs" },
                        { text: "Health Check", url: "/health" },
                    ],
                    favIcon: {
                        default: "static/images/logo.svg",
                        alternative: "static/favicon-32x32.png",
                    },
                },
            },
        });

        logger.info("Bull Board dashboard configured at /admin/queues");
        return serverAdapter;
    } catch (error) {
        logger.error(`Failed to create Bull Board dashboard: ${error.message}`, {
            error: error.stack,
        });
        throw error;
    }
};

/**
 * Get the Bull Board router
 * @returns {Router} Express router for Bull Board
 */
export const getBullBoardRouter = () => {
    const adapter = createBullBoardDashboard();
    return adapter.getRouter();
};

export default {
    createBullBoardDashboard,
    getBullBoardRouter,
};

