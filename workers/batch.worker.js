import { Worker } from "bullmq";
import { getRedisConnection } from "../config/redis.config.js";
import logger from "../utils/logger.js";
import { processBatchJobById } from "../services/batch-job-processor.service.js";
import { BATCH_QUEUE_NAME } from "../queues/batch.queue.js";

const WORKER_CONCURRENCY = parseInt(process.env.BATCH_WORKER_CONCURRENCY, 10) || 3;

let batchWorker = null;

const processJob = async (job) => {
    const { batchJobId } = job.data || {};
    if (!batchJobId) {
        throw new Error("Missing batchJobId");
    }
    logger.info(`Batch worker processing job ${batchJobId}`);
    await processBatchJobById(batchJobId);
    return { batchJobId, ok: true };
};

export const startBatchWorker = () => {
    if (batchWorker) {
        logger.warn("Batch worker already running");
        return batchWorker;
    }

    const connection = getRedisConnection();
    batchWorker = new Worker(BATCH_QUEUE_NAME, processJob, {
        connection,
        concurrency: WORKER_CONCURRENCY,
    });

    batchWorker.on("completed", (job) => {
        logger.debug(`Batch job completed`, { jobId: job.id });
    });

    batchWorker.on("failed", (job, err) => {
        logger.error(`Batch job failed`, {
            jobId: job?.id,
            error: err.message,
        });
    });

    batchWorker.on("error", (error) => {
        logger.error("Batch worker error:", error.message);
    });

    logger.info(`Batch worker started (concurrency ${WORKER_CONCURRENCY})`);
    return batchWorker;
};

export const stopBatchWorker = async () => {
    if (batchWorker) {
        await batchWorker.close();
        batchWorker = null;
        logger.info("Batch worker stopped");
    }
};

export default { startBatchWorker, stopBatchWorker };
