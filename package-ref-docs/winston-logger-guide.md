# Winston Logger Guide

## Overview

Winston is a logging library for Node.js. It logs application events, errors, and debugging information to console and files.

## Installation

```bash
npm install winston
```

## Log Levels

| Level | Usage                            |
| ----- | -------------------------------- |
| error | Runtime errors and exceptions    |
| warn  | Warnings and suspicious activity |
| info  | Important application events     |
| debug | Detailed debugging (dev only)    |

## Configuration

**Location**: `utils/logger.js`

**Environment-based behavior**:

- Development: Console only, debug level, colorized
- Production: Console + files, info level, plain text

**Log files** (production only):

- `logs/error.log` - Error logs only
- `logs/combined.log` - All logs

## Basic Usage

### Import Logger

```javascript
import logger from "../utils/logger.js";
```

### Controller Example

```javascript
export const createEmployee = async (req, res) => {
  try {
    logger.info(`Creating employee: ${req.body.name}`);

    const employee = await Employee.create(req.body);

    logger.info(`Employee created - ID: ${employee.id}`);

    res.status(201).json({ success: true, data: employee });
  } catch (error) {
    logger.error(`Failed to create employee: ${error.message}`, {
      stack: error.stack,
    });

    res
      .status(500)
      .json({ success: false, error: "Failed to create employee" });
  }
};
```

## Common Use Cases

### Catch Block Pattern

```javascript
try {
  // Your code
} catch (error) {
  logger.error(`Operation failed: ${error.message}`, {
    stack: error.stack,
    context: "additional info",
  });

  res.status(500).json({ error: "Operation failed" });
}
```

### Database Errors

```javascript
try {
  await Employee.create(data);
} catch (error) {
  if (error.name === "SequelizeUniqueConstraintError") {
    logger.warn(`Duplicate entry: ${data.email}`);
    return res.status(409).json({ error: "Already exists" });
  }

  logger.error(`Database error: ${error.message}`);
  res.status(500).json({ error: "Database operation failed" });
}
```

### Authentication

```javascript
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    logger.info(`Login attempt: ${email}`);

    const user = await authenticateUser(email, password);

    if (!user) {
      logger.warn(`Failed login: ${email}`);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    logger.info(`Successful login: ${email}`);
    res.json({ token: generateToken(user) });
  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({ error: "Login failed" });
  }
};
```

### Middleware

```javascript
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      logger.warn("Auth attempt without token");
      return res.status(401).json({ error: "No token" });
    }

    req.user = verifyToken(token);
    logger.info(`User authenticated: ${req.user.email}`);
    next();
  } catch (error) {
    logger.error(`Auth failed: ${error.message}`);
    res.status(401).json({ error: "Invalid token" });
  }
};
```

### Global Error Handler

```javascript
// Add to app.js
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, {
    method: req.method,
    url: req.url,
    stack: err.stack,
  });

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal Server Error",
  });
});
```

### Server Startup

```javascript
// bin/index.js
import logger from "../utils/logger.js";

server.listen(PORT, () => {
  logger.info(`Server started on port ${PORT}`);
});

server.on("error", (error) => {
  logger.error(`Server error: ${error.message}`);
  process.exit(1);
});
```

## Best Practices

### 1. Use Correct Log Levels

```javascript
logger.info("User registered"); // Normal events
logger.warn("Rate limit approaching"); // Warnings
logger.error("Database connection lost"); // Errors
logger.debug("Query params:", params); // Debug info
```

### 2. Include Context

```javascript
// Good
logger.error(`Failed to process payroll for employee ${id}`, { id, month });

// Bad
logger.error("Payroll failed");
```

### 3. Never Log Sensitive Data

```javascript
// Good
logger.info(`Login attempt: ${email}`);

// Bad
logger.info(`Login: ${email} password: ${password}`);
```

### 4. Structured Logging

```javascript
logger.info("Payment processed", {
  amount: 1000,
  userId: 123,
  transactionId: "txn_abc",
});
```

## Environment Setup

Set `NODE_ENV` in `.env`:

```bash
NODE_ENV=development  # or production
```

## Output Examples

**Development Console**:

```
2025-11-08 14:30:15 info: Server started on port 5001
2025-11-08 14:30:22 info: Creating employee: John Doe
2025-11-08 14:30:45 warn: Failed login: user@example.com
2025-11-08 14:31:02 error: Database connection failed
```

**Production Files** (`logs/error.log`):

```
2025-11-08 14:31:02 [ERROR]: Database connection failed
Error: Connection timeout
    at Connection.connect (/app/db/connection.js:45:12)
```

## Troubleshooting

**Logs not appearing**: Check NODE_ENV and log level
**Files not created**: Ensure NODE_ENV=production and logs/ directory exists
**No colors**: Colors disabled in production file logs (intentional)

## Integration

Winston logs application events. Morgan logs HTTP requests. Use both together for complete coverage.

## Security

- Never log passwords or tokens
- Sanitize user input before logging
- Mask PII in production logs
- Secure log file access
