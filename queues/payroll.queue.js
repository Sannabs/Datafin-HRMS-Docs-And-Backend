import { Queue, FlowProducer } from "bullmq";
import { getRedisConnection } from "../config/redis.config.js";
import logger from "../utils/logger.js";

// Queue names
export const PAYROLL_QUEUE_NAME = "payroll-processing";
export const PAYROLL_EMPLOYEE_QUEUE_NAME = "payroll-employee";

// Default job options
const DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: {
        type: "exponential",
        delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000, // Keep last 1000 completed jobs
    },
    removeOnFail: {
        age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
};

// Create payroll queue instance
let payrollQueue = null;
let employeeQueue = null;
let flowProducer = null;

/**
 * Get or create the main payroll queue
 * @returns {Queue} Payroll queue instance
 */
export const getPayrollQueue = () => {
    if (!payrollQueue) {
        const connection = getRedisConnection();
        payrollQueue = new Queue(PAYROLL_QUEUE_NAME, {
            connection,
            defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });

        payrollQueue.on("error", (error) => {
            logger.error("Payroll queue error:", error.message);
        });

        logger.info("Payroll queue initialized");
    }
    return payrollQueue;
};

/**
 * Get or create the employee processing queue
 * @returns {Queue} Employee queue instance
 */
export const getEmployeeQueue = () => {
    if (!employeeQueue) {
        const connection = getRedisConnection();
        employeeQueue = new Queue(PAYROLL_EMPLOYEE_QUEUE_NAME, {
            connection,
            defaultJobOptions: {
                ...DEFAULT_JOB_OPTIONS,
                priority: 10, // Lower priority (higher number = lower priority)
            },
        });

        employeeQueue.on("error", (error) => {
            logger.error("Employee queue error:", error.message);
        });

        logger.info("Employee queue initialized");
    }
    return employeeQueue;
};

/**
 * Get or create the flow producer for parent-child job relationships
 * @returns {FlowProducer} Flow producer instance
 */
export const getFlowProducer = () => {
    if (!flowProducer) {
        const connection = getRedisConnection();
        flowProducer = new FlowProducer({ connection });

        flowProducer.on("error", (error) => {
            logger.error("Flow producer error:", error.message);
        });

        logger.info("Flow producer initialized");
    }
    return flowProducer;
};

/**
 * Add a payroll run job to the queue
 * @param {Object} data - Job data
 * @param {string} data.payrollRunId - Payroll run ID
 * @param {string} data.tenantId - Tenant ID
 * @param {string} data.payPeriodId - Pay period ID
 * @param {Array<string>} data.employeeIds - Array of employee IDs to process
 * @param {string} data.processedBy - User ID who started the run
 * @returns {Promise<Object>} Created job
 */
export const addPayrollRunJob = async (data) => {
    const { payrollRunId, tenantId, payPeriodId, employeeIds, processedBy } = data;

    const queue = getPayrollQueue();

    // Create parent job that tracks the entire payroll run
    const job = await queue.add(
        "process-payroll-run",
        {
            payrollRunId,
            tenantId,
            payPeriodId,
            employeeIds,
            processedBy,
            totalEmployees: employeeIds.length,
        },
        {
            jobId: `payroll-run-${payrollRunId}`,
            priority: 1, // High priority for payroll runs
        }
    );

    logger.info(`Added payroll run job to queue`, {
        jobId: job.id,
        payrollRunId,
        employeeCount: employeeIds.length,
    });

    return job;
};

/**
 * Add individual employee payroll jobs to the queue
 * @param {string} payrollRunId - Parent payroll run ID
 * @param {string} payPeriodId - Pay period ID
 * @param {string} tenantId - Tenant ID
 * @param {Array<string>} employeeIds - Array of employee IDs
 * @returns {Promise<Array<Object>>} Created jobs
 */
export const addEmployeePayrollJobs = async (payrollRunId, payPeriodId, tenantId, employeeIds) => {
    const queue = getEmployeeQueue();

    const jobs = await queue.addBulk(
        employeeIds.map((employeeId, index) => ({
            name: "process-employee",
            data: {
                payrollRunId,
                payPeriodId,
                tenantId,
                employeeId,
                index,
                total: employeeIds.length,
            },
            opts: {
                jobId: `employee-${payrollRunId}-${employeeId}`,
                priority: 10 + index, // Process in order but allow parallel processing
            },
        }))
    );

    logger.info(`Added ${jobs.length} employee jobs to queue`, {
        payrollRunId,
        employeeCount: employeeIds.length,
    });

    return jobs;
};

/**
 * Get job status by job ID
 * @param {string} jobId - BullMQ job ID
 * @returns {Promise<Object|null>} Job status or null
 */
export const getJobStatus = async (jobId) => {
    const queue = getPayrollQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
        return null;
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
        id: job.id,
        name: job.name,
        state,
        progress,
        data: job.data,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        finishedOn: job.finishedOn,
        processedOn: job.processedOn,
        timestamp: job.timestamp,
    };
};

/**
 * Get queue metrics
 * @returns {Promise<Object>} Queue metrics
 */
export const getQueueMetrics = async () => {
    const payrollQ = getPayrollQueue();
    const employeeQ = getEmployeeQueue();

    const [
        payrollWaiting,
        payrollActive,
        payrollCompleted,
        payrollFailed,
        employeeWaiting,
        employeeActive,
        employeeCompleted,
        employeeFailed,
    ] = await Promise.all([
        payrollQ.getWaitingCount(),
        payrollQ.getActiveCount(),
        payrollQ.getCompletedCount(),
        payrollQ.getFailedCount(),
        employeeQ.getWaitingCount(),
        employeeQ.getActiveCount(),
        employeeQ.getCompletedCount(),
        employeeQ.getFailedCount(),
    ]);

    return {
        payrollQueue: {
            waiting: payrollWaiting,
            active: payrollActive,
            completed: payrollCompleted,
            failed: payrollFailed,
        },
        employeeQueue: {
            waiting: employeeWaiting,
            active: employeeActive,
            completed: employeeCompleted,
            failed: employeeFailed,
        },
        timestamp: new Date().toISOString(),
    };
};

/**
 * Retry a failed job
 * @param {string} queueName - Queue name
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>} Success status
 */
export const retryJob = async (queueName, jobId) => {
    const queue = queueName === PAYROLL_QUEUE_NAME ? getPayrollQueue() : getEmployeeQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
        return false;
    }

    await job.retry();
    logger.info(`Retried job ${jobId} in ${queueName}`);
    return true;
};

/**
 * Clean up old jobs from queues
 * @param {number} gracePeriod - Grace period in milliseconds (default: 24 hours)
 */
export const cleanupOldJobs = async (gracePeriod = 24 * 60 * 60 * 1000) => {
    const payrollQ = getPayrollQueue();
    const employeeQ = getEmployeeQueue();

    await Promise.all([
        payrollQ.clean(gracePeriod, 1000, "completed"),
        payrollQ.clean(gracePeriod * 7, 1000, "failed"),
        employeeQ.clean(gracePeriod, 1000, "completed"),
        employeeQ.clean(gracePeriod * 7, 1000, "failed"),
    ]);

    logger.info("Cleaned up old jobs from queues");
};

/**
 * Close all queue connections gracefully
 */
export const closeQueues = async () => {
    const promises = [];

    if (payrollQueue) {
        promises.push(payrollQueue.close());
    }
    if (employeeQueue) {
        promises.push(employeeQueue.close());
    }
    if (flowProducer) {
        promises.push(flowProducer.close());
    }

    await Promise.all(promises);
    logger.info("All queue connections closed");
};

export default {
    getPayrollQueue,
    getEmployeeQueue,
    getFlowProducer,
    addPayrollRunJob,
    addEmployeePayrollJobs,
    getJobStatus,
    getQueueMetrics,
    retryJob,
    cleanupOldJobs,
    closeQueues,
    PAYROLL_QUEUE_NAME,
    PAYROLL_EMPLOYEE_QUEUE_NAME,
};

