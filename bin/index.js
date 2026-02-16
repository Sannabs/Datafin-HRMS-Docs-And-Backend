import http from "http";
import { networkInterfaces } from "os";
import app from "../app.js";
import logger from "../utils/logger.js";
import prisma from "../config/prisma.config.js";
import { startAllAutomationJobs } from "../automations/pay-period-auto-close.job.js";
import { testRedisConnection, closeRedisConnection } from "../config/redis.config.js";
import { startAllWorkers, stopAllWorkers } from "../workers/payroll.worker.js";
import { closeQueues } from "../queues/payroll.queue.js";


// BullMQ is optional during development
// Set ENABLE_BULLMQ_QUEUE=true in .env to enable queue-based processing
const ENABLE_BULLMQ = process.env.ENABLE_BULLMQ_QUEUE === "true";

const server = http.createServer(app);




const getLocalIP = () => {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
};
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
  // try {
  //   await startAllAutomationJobs();
  // } catch (error) {
  //   logger.error(`Failed to start automation jobs: ${error.message}`, {
  //     error: error.stack,
  //   });
  // }
});

// Graceful shutdown
// const gracefulShutdown = async (signal) => {
//   logger.info(`Received ${signal}, shutting down gracefully...`);

//   server.close(async () => {
//     logger.info("HTTP server closed");

//     // Stop BullMQ workers (if enabled)
//     if (ENABLE_BULLMQ) {
//       try {
//         await stopAllWorkers();
//         await closeQueues();
//         await closeRedisConnection();
//         logger.info("BullMQ resources cleaned up");
//       } catch (error) {
//         logger.error(`Error cleaning up BullMQ: ${error.message}`);
//       }
//     }

//     process.exit(0);
//   });
// };

// Force shutdown after 30 seconds
// const shutdownTimer = setTimeout(() => {
//   logger.error("Forced shutdown after timeout");
//   process.exit(1);
// }, 30000);

// process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
// process.on("SIGINT", () => gracefulShutdown("SIGINT"));
