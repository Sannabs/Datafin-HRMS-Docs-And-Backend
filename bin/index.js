import http from "http";
import app from "../app.js";
import logger from "../utils/logger.js";

const server = http.createServer(app);

server.listen(process.env.PORT || 5001, () => {
  logger.info(`Server is running on port ${process.env.PORT || 5001}`);
});
