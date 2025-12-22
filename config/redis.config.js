import Redis from "ioredis";
import logger from "../utils/logger.js";

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false, // Recommended for BullMQ
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error("Redis connection failed after 10 retries");
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000);
    logger.warn(`Redis connection retry ${times}, waiting ${delay}ms`);
    return delay;
  },
};

// Create Redis connection for BullMQ
let redisConnection = null;

/**
 * Get or create Redis connection for BullMQ
 * @returns {Redis} Redis connection instance
 */
export const getRedisConnection = () => {
  if (!redisConnection) {
    redisConnection = new Redis(redisConfig);

    redisConnection.on("connect", () => {
      logger.info("Redis connected successfully");
    });

    redisConnection.on("error", (error) => {
      logger.error("Redis connection error:", error.message);
    });

    redisConnection.on("close", () => {
      logger.warn("Redis connection closed");
    });

    redisConnection.on("reconnecting", () => {
      logger.info("Redis reconnecting...");
    });
  }

  return redisConnection;
};

/**
 * Test Redis connection
 * @returns {Promise<boolean>} True if connected, false otherwise
 */
export const testRedisConnection = async () => {
  try {
    const redis = getRedisConnection();
    const result = await redis.ping();
    return result === "PONG";
  } catch (error) {
    logger.error("Redis connection test failed:", error.message);
    return false;
  }
};

/**
 * Close Redis connection gracefully
 */
export const closeRedisConnection = async () => {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    logger.info("Redis connection closed gracefully");
  }
};

