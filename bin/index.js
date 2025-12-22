import http from "http";
import app from "../app.js";
import logger from "../utils/logger.js";
import { startAllAutomationJobs } from "../automations/pay-period-auto-close.job.js";
import { testRedisConnection, closeRedisConnection } from "../config/redis.config.js";
import { startAllWorkers, stopAllWorkers } from "../workers/payroll.worker.js";
import { closeQueues } from "../queues/payroll.queue.js";

const USE_BULLMQ = process.env.ENABLE_BULLMQ_QUEUE === "true";

const server = http.createServer(app);

server.listen(process.env.PORT || 5001, async () => {
  logger.info(`Server is running on port ${process.env.PORT || 5001}`);

  // Start BullMQ workers if enabled
  if (USE_BULLMQ) {
    try {
      const redisConnected = await testRedisConnection();
      if (redisConnected) {
        startAllWorkers();
        logger.info("BullMQ workers started successfully");
      } else {
        logger.error("Redis connection failed - BullMQ workers not started");
      }
    } catch (error) {
      logger.error(`Failed to start BullMQ workers: ${error.message}`, {
        error: error.stack,
      });
    }
  } else {
    logger.info("BullMQ is disabled (ENABLE_BULLMQ_QUEUE != true)");
  }

  // Start automation jobs
  // try {
  //   await startAllAutomationJobs();
  // } catch (error) {
  //   logger.error(`Failed to start automation jobs: ${error.message}`, {
  //     error: error.stack,
  //   });
  // }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    logger.info("HTTP server closed");

    // Stop BullMQ workers
    if (USE_BULLMQ) {
      try {
        await stopAllWorkers();
        await closeQueues();
        await closeRedisConnection();
        logger.info("BullMQ resources cleaned up");
      } catch (error) {
        logger.error(`Error cleaning up BullMQ: ${error.message}`);
      }
    }

    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
