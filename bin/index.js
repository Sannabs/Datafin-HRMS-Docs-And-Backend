import http from "http";
import app from "../app.js";
import logger from "../utils/logger.js";
import { startAllAutomationJobs } from "../automations/pay-period-auto-close.job.js";

const server = http.createServer(app);

server.listen(process.env.PORT || 5001, async () => {
  logger.info(`Server is running on port ${process.env.PORT || 5001}`);
  
  // Start automation jobs
  try {
    await startAllAutomationJobs();
  } catch (error) {
    logger.error(`Failed to start automation jobs: ${error.message}`, {
      error: error.stack,
    });
  }
});
