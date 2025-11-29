import logger from "./logger.js";

/**
 * Setup Server-Sent Events response headers
 * @param {Object} res - Express response object
 */
export const setupSSE = (res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();
};

/**
 * Send SSE update to client
 * @param {Object} res - Express response object
 * @param {Object} data - Data to send
 * @param {string} event - Event type (optional)
 */
export const sendSSEUpdate = (res, data, event = null) => {
    try {
        if (event) {
            res.write(`event: ${event}\n`);
        }
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.flush && res.flush();
    } catch (error) {
        logger.error(`Error sending SSE update: ${error.message}`, {
            error: error.stack,
        });
    }
};

/**
 * Send SSE comment (heartbeat/ping)
 * @param {Object} res - Express response object
 */
export const sendSSEComment = (res) => {
    try {
        res.write(": heartbeat\n\n");
        res.flush && res.flush();
    } catch (error) {
        logger.error(`Error sending SSE comment: ${error.message}`, {
            error: error.stack,
        });
    }
};

/**
 * Close SSE connection
 * @param {Object} res - Express response object
 */
export const closeSSE = (res) => {
    try {
        res.write("data: [DONE]\n\n");
        res.end();
    } catch (error) {
        logger.error(`Error closing SSE connection: ${error.message}`, {
            error: error.stack,
        });
        res.end();
    }
};

/**
 * Create SSE connection handler with heartbeat
 * @param {Object} res - Express response object
 * @param {Function} onClose - Callback when connection closes
 * @returns {Object} Connection handler object
 */
export const createSSEConnection = (res, onClose = null) => {
    setupSSE(res);

    // Send initial connection message
    sendSSEUpdate(res, { type: "connected", message: "SSE connection established" });

    // Setup heartbeat interval (every 30 seconds)
    const heartbeatInterval = setInterval(() => {
        try {
            sendSSEComment(res);
        } catch (error) {
            clearInterval(heartbeatInterval);
            if (onClose) onClose();
        }
    }, 30000);

    // Handle client disconnect
    res.on("close", () => {
        clearInterval(heartbeatInterval);
        if (onClose) onClose();
        logger.info("SSE connection closed by client");
    });

    return {
        send: (data, event) => sendSSEUpdate(res, data, event),
        close: () => {
            clearInterval(heartbeatInterval);
            closeSSE(res);
            if (onClose) onClose();
        },
    };
};

