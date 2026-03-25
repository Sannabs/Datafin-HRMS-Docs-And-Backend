import http from "http";
import app from "../app.js";
import logger from "../utils/logger.js";
import prisma from "../config/prisma.config.js";
import { getLocalIP } from "../utils/network.utils.js";
import { startAllAutomationJobs } from "../automations/pay-period-auto-close.job.js";
import { testRedisConnection } from "../config/redis.config.js";
import { startAllWorkers } from "../workers/payroll.worker.js";
import { startAllLeaveAutomationJobs } from "../automations/leave-accrual.job.js";
import {
  registerPatrolCrons,
  generateUpcomingSessions,
  closeExpiredSessions,
} from "../automations/patrol.cron.js";
import "../automations/absent.automation.js";

// BullMQ is optional during development
// Set ENABLE_BULLMQ_QUEUE=true in .env to enable queue-based processing
const ENABLE_BULLMQ = process.env.ENABLE_BULLMQ_QUEUE === "true";

const server = http.createServer(app);

server.listen(process.env.PORT || 5001, "0.0.0.0", async () => {


  logger.info(`Server is running on port ${process.env.PORT || 5001}`);
  logger.info(`Local network: http://${getLocalIP()}:${process.env.PORT || 5001}`);

  // Test database connection
  try {
    await prisma.$connect();
    logger.info("✅ Database connected successfully and ready to accept queries");
  } catch (error) {
    logger.error(`❌ Database connection failed: ${error.message}`);
    logger.error("Server will continue but database operations may fail");
  }

  if (ENABLE_BULLMQ) {
    try {
      const redisConnected = await testRedisConnection();
      if (redisConnected) {
        startAllWorkers();
        logger.info("BullMQ workers started successfully");
      } else {
        logger.warn("Redis connection failed - BullMQ workers not started. Set ENABLE_BULLMQ_QUEUE=false to disable, or start Redis.");
      }
    } catch (error) {
      logger.warn(`Failed to start BullMQ workers: ${error.message}. Set ENABLE_BULLMQ_QUEUE=false to disable.`);
    }
  }

  // Start automation jobs
  try {
    await startAllAutomationJobs();
    await startAllLeaveAutomationJobs();

    registerPatrolCrons();
    await Promise.all([generateUpcomingSessions(), closeExpiredSessions()]);
  } catch (error) {
    logger.error(`Failed to start automation jobs: ${error.message}`, {
      error: error.stack,
    });
  }
});