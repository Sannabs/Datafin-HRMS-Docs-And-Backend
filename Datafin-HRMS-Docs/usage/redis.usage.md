# Redis Setup Guide

Redis is required for BullMQ job queue processing (payroll runs, background tasks).

## Prerequisites

- **Docker Desktop** installed on your system
  - Download: https://www.docker.com/products/docker-desktop/
  - Windows: Choose AMD64 for most PCs (Intel/AMD processors), ARM64 only for Windows on ARM devices

## Starting Redis

### First Time Setup

```bash
docker run -d --name redis -p 6379:6379 redis:latest
```

| Flag           | Purpose                            |
| -------------- | ---------------------------------- |
| `-d`           | Run in detached mode (background)  |
| `--name redis` | Name the container "redis"         |
| `-p 6379:6379` | Map port 6379 on host to container |
| `redis:latest` | Use official Redis image           |

### After Reboot / Docker Restart

```bash
docker start redis
```

## Common Commands

```bash
# Check if Redis is running
docker ps

# Stop Redis
docker stop redis

# Start Redis (after stopping)
docker start redis

# Remove Redis container (must stop first)
docker rm redis

# Test Redis connection
docker exec redis redis-cli ping
# Expected output: PONG

# View Redis logs
docker logs redis

# Access Redis CLI
docker exec -it redis redis-cli
```

## Environment Variables

Add to your `.env` file:

```env
# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# BullMQ Feature Flag
ENABLE_BULLMQ_QUEUE=true

# Worker Configuration
PAYROLL_WORKER_CONCURRENCY=5
```

### Variable Descriptions

| Variable                     | Description                    | Default     |
| ---------------------------- | ------------------------------ | ----------- |
| `REDIS_HOST`                 | Redis server hostname          | `localhost` |
| `REDIS_PORT`                 | Redis server port              | `6379`      |
| `REDIS_PASSWORD`             | Redis password (optional)      | empty       |
| `REDIS_DB`                   | Redis database number          | `0`         |
| `ENABLE_BULLMQ_QUEUE`        | Enable BullMQ queue processing | `false`     |
| `PAYROLL_WORKER_CONCURRENCY` | Number of parallel workers     | `5`         |

## Troubleshooting

### "Cannot connect to Redis"
1. Ensure Docker Desktop is running
2. Check container status: `docker ps`
3. If not listed, start it: `docker start redis`
4. If container doesn't exist, create it with the first-time setup command

### "Port 6379 already in use"
Another process is using port 6379. Either:
- Stop the other process, or
- Use a different port: `docker run -d --name redis -p 6380:6379 redis:latest`
  - Update `REDIS_PORT=6380` in `.env`

### "Container name already in use"
```bash
docker rm redis
docker run -d --name redis -p 6379:6379 redis:latest
```

## Bull Board Dashboard

When BullMQ is enabled, a web-based dashboard is available for monitoring queues:

- **URL**: `http://localhost:5001/admin/queues`
- **Features**:
  - View queue metrics (waiting, active, completed, failed jobs)
  - Inspect individual job data and progress
  - Retry failed jobs
  - Clean up old jobs

## Prisma Migration

Before using BullMQ, run the migration to add the `queueJobId` field:

```bash
cd backend
npx prisma migrate dev --name add_queue_job_id_to_payroll_run
npx prisma generate
```

## API Endpoints

When BullMQ is enabled, additional endpoints are available:

| Endpoint                           | Method | Description                      |
| ---------------------------------- | ------ | -------------------------------- |
| `/api/payroll-runs/queue/config`   | GET    | Get queue configuration          |
| `/api/payroll-runs/queue/metrics`  | GET    | Get queue metrics                |
| `/api/payroll-runs/:id/job-status` | GET    | Get job status for a payroll run |
| `/api/payroll-runs/:id/retry`      | POST   | Retry a failed payroll run       |

## Notes

- Redis data is **ephemeral** - it's lost when the container is removed
- This is fine for job queues (they don't need persistence)
- Redis stops when Docker Desktop closes or PC shuts down
- Always run `docker start redis` before starting the backend server
- When `ENABLE_BULLMQ_QUEUE=true`, payroll runs are processed via the queue
- When `ENABLE_BULLMQ_QUEUE=false`, payroll runs use sequential processing (legacy mode)

