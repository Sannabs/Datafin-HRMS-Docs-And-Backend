import { Queue } from "bullmq";
import { getRedisConnection } from "../config/redis.config.js";
import logger from "../utils/logger.js";

export const BATCH_QUEUE_NAME = "batch-job-processing";

const DEFAULT_JOB_OPTIONS = {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { age: 24 * 3600, count: 500 },
    removeOnFail: { age: 7 * 24 * 3600 },
};

let batchQueue = null;

export const getBatchQueue = () => {
    if (!batchQueue) {
        const connection = getRedisConnection();
        batchQueue = new Queue(BATCH_QUEUE_NAME, {
            connection,
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });
        batchQueue.on("error", (error) => {
            logger.error("Batch queue error:", error.message);
        });
        logger.info("Batch queue initialized");
    }
    return batchQueue;
};

/**
 * @param {string} batchJobId
 */
export const enqueueBatchJob = async (batchJobId) => {
    const queue = getBatchQueue();
    await queue.add(
        "processBatchJob",
        { batchJobId },
        {
            jobId: `batch-${batchJobId}`,
        }
    );
};
