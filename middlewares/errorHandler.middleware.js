import logger from "../utils/logger.js";
import pkg from "@prisma/client";
const { Prisma } = pkg;
export const errorHandler = (err, req, res, next) => {
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return res.status(409).json({
          success: false,
          error: "Duplicate entry",
          message: "A record with this information already exists",
        });
      case "P2025":
        return res.status(404).json({
          success: false,
          error: "Not found",
          message: "The requested resource was not found",
        });
      case "P2003":
        return res.status(400).json({
          success: false,
          error: "Invalid reference",
          message: "Referenced record does not exist",
        });
      default:
        return res.status(400).json({
          success: false,
          error: "Database error",
          message:
            process.env.NODE_ENV === "development"
              ? err.message
              : "A database error occurred",
        });
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({
      success: false,
      error: "Validation error",
      message: "Invalid data provided",
    });
  }

  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.name || "Error",
      message: err.message,
    });
  }

  return res.status(500).json({
    success: false,
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "An error occurred. Please try again later.",
  });
};
