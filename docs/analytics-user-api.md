# User Analytics API Documentation

## Overview

The User Analytics API provides endpoints for retrieving user-related metrics and statistics for HR dashboard visualization. All endpoints are tenant-scoped and require authentication with HR_ADMIN or HR_STAFF roles.

---

## Base URL

```
/api/analytics/users
```

---

## Authentication

All endpoints require:

- Valid session token (via `requireAuth` middleware)
- Role: `HR_ADMIN` or `HR_STAFF` (via `requireRole` middleware)

---

## Endpoints

### 1. GET /overview

Retrieves a comprehensive overview of user statistics including totals and distributions.

#### Query Parameters

| Parameter        | Type              | Required | Default | Description                            |
| ---------------- | ----------------- | -------- | ------- | -------------------------------------- |
| `start`          | ISO 8601 DateTime | No       | -       | Start date for "new users" calculation |
| `end`            | ISO 8601 DateTime | No       | -       | End date for "new users" calculation   |
| `includeDeleted` | Boolean           | No       | `false` | Include soft-deleted users in counts   |

#### Response

```json
{
  "success": true,
  "data": {
    "total": 245,
    "newUsers": 18,
    "byRole": [
      { "role": "EMPLOYEE", "count": 200 },
      { "role": "HR_STAFF", "count": 40 },
      { "role": "HR_ADMIN", "count": 5 }
    ],
    "byStatus": [
      { "status": "ACTIVE", "count": 220 },
      { "status": "TERMINATED", "count": 25 }
    ],
    "byDepartment": [
      { "departmentId": "uuid", "departmentName": "Engineering", "count": 80 },
      { "departmentId": "uuid", "departmentName": "Sales", "count": 60 },
      { "departmentId": null, "departmentName": null, "count": 10 }
    ],
    "byPosition": [
      {
        "positionId": "uuid",
        "positionTitle": "Software Engineer",
        "count": 45
      },
      {
        "positionId": "uuid",
        "positionTitle": "Sales Representative",
        "count": 30
      },
      { "positionId": null, "positionTitle": null, "count": 5 }
    ]
  }
}
```

#### Suggested Visualizations

| Data Field     | Primary Chart Type   | Alternative Chart Types                        |
| -------------- | -------------------- | ---------------------------------------------- |
| `total`        | KPI Card             | Gauge, Stat Card, Big Number Display           |
| `newUsers`     | KPI Card             | Gauge, Stat Card, Sparkline with Number        |
| `byRole`       | Donut Chart          | Pie Chart, Horizontal Bar Chart, Treemap       |
| `byStatus`     | Donut Chart          | Pie Chart, Stacked Bar Chart, Radial Bar Chart |
| `byDepartment` | Horizontal Bar Chart | Vertical Bar Chart, Treemap, Bubble Chart      |
| `byPosition`   | Horizontal Bar Chart | Vertical Bar Chart, Word Cloud, Treemap        |

---

### 2. GET /registrations

Retrieves user registration counts grouped by time intervals.

#### Query Parameters

| Parameter        | Type              | Required | Default | Description                                  |
| ---------------- | ----------------- | -------- | ------- | -------------------------------------------- |
| `start`          | ISO 8601 DateTime | No       | -       | Start of date range                          |
| `end`            | ISO 8601 DateTime | No       | -       | End of date range                            |
| `interval`       | String            | No       | `day`   | Grouping interval: `day`, `week`, or `month` |
| `includeDeleted` | Boolean           | No       | `false` | Include soft-deleted users                   |

#### Response

```json
{
  "success": true,
  "data": [
    { "bucket": "2024-01-01T00:00:00.000Z", "count": 5 },
    { "bucket": "2024-01-02T00:00:00.000Z", "count": 8 },
    { "bucket": "2024-01-03T00:00:00.000Z", "count": 3 }
  ]
}
```

#### Suggested Visualizations

| Data             | Primary Chart Type | Alternative Chart Types                                    |
| ---------------- | ------------------ | ---------------------------------------------------------- |
| Time series data | Line Chart         | Area Chart, Step Line Chart, Bar Chart, Stacked Area Chart |

#### Chart Configuration Options

| Option         | Values           | Description                           |
| -------------- | ---------------- | ------------------------------------- |
| Interval       | day, week, month | Granularity of time buckets           |
| Cumulative     | true/false       | Show running total vs discrete counts |
| Moving Average | 7-day, 30-day    | Smooth trend visualization            |
| Comparison     | Previous period  | Overlay previous period for trend     |

---

### 3. GET /logins

Retrieves login session counts grouped by time intervals. Login events are derived from session creation timestamps.

#### Query Parameters

| Parameter  | Type              | Required | Default | Description                                  |
| ---------- | ----------------- | -------- | ------- | -------------------------------------------- |
| `start`    | ISO 8601 DateTime | No       | -       | Start of date range                          |
| `end`      | ISO 8601 DateTime | No       | -       | End of date range                            |
| `interval` | String            | No       | `day`   | Grouping interval: `day`, `week`, or `month` |

#### Response

```json
{
  "success": true,
  "data": [
    { "bucket": "2024-01-01T00:00:00.000Z", "count": 45 },
    { "bucket": "2024-01-02T00:00:00.000Z", "count": 52 },
    { "bucket": "2024-01-03T00:00:00.000Z", "count": 38 }
  ]
}
```

#### Suggested Visualizations

| Data             | Primary Chart Type | Alternative Chart Types                                    |
| ---------------- | ------------------ | ---------------------------------------------------------- |
| Time series data | Line Chart         | Area Chart, Step Line Chart, Bar Chart, Stacked Area Chart |

#### Chart Configuration Options

| Option                | Values           | Description                                   |
| --------------------- | ---------------- | --------------------------------------------- |
| Interval              | day, week, month | Granularity of time buckets                   |
| Overlay Registrations | true/false       | Compare logins vs registrations on same chart |
| Unique Users          | true/false       | Count unique users vs total sessions          |
| Peak Hours            | Heatmap          | Show login activity by hour/day matrix        |

#### Combined Chart Options (Logins + Registrations)

| Chart Type         | Description                                          |
| ------------------ | ---------------------------------------------------- |
| Dual Line Chart    | Two lines showing registrations and logins over time |
| Stacked Area Chart | Combined view of user activity                       |
| Combo Chart        | Bars for registrations, line for logins              |
| Ratio Line         | Logins per registration ratio over time              |

---

### 4. GET /recency

Retrieves user counts bucketed by last login recency. Useful for identifying inactive users.

#### Query Parameters

| Parameter        | Type    | Required | Default | Description                |
| ---------------- | ------- | -------- | ------- | -------------------------- |
| `includeDeleted` | Boolean | No       | `false` | Include soft-deleted users |

#### Response

```json
{
  "success": true,
  "data": {
    "0_7_days": 150,
    "8_30_days": 45,
    "31_90_days": 25,
    "90plus_days": 15,
    "never_logged_in": 10
  }
}
```

#### Recency Buckets

| Bucket            | Description                                |
| ----------------- | ------------------------------------------ |
| `0_7_days`        | Users who logged in within the last 7 days |
| `8_30_days`       | Users who logged in 8-30 days ago          |
| `31_90_days`      | Users who logged in 31-90 days ago         |
| `90plus_days`     | Users who logged in more than 90 days ago  |
| `never_logged_in` | Users who have never logged in             |

#### Suggested Visualizations

| Data                 | Primary Chart Type | Alternative Chart Types                                    |
| -------------------- | ------------------ | ---------------------------------------------------------- |
| Recency distribution | Donut Chart        | Pie Chart, Horizontal Bar Chart, Stacked Bar Chart, Funnel |

#### Chart Variations

| Chart Type           | Best Use Case                                              |
| -------------------- | ---------------------------------------------------------- |
| Donut Chart          | Quick overview of user engagement distribution             |
| Pie Chart            | Simple percentage breakdown                                |
| Horizontal Bar Chart | Easy comparison of bucket sizes                            |
| Stacked Bar Chart    | Compare recency across departments or roles                |
| Funnel Chart         | Visualize user drop-off from active to inactive            |
| Gauge Chart          | Show percentage of active users (0-7 days) as health score |
| Traffic Light        | Red/Yellow/Green indicator based on engagement thresholds  |

#### Derived Metrics

| Metric               | Calculation                      | Chart Type      |
| -------------------- | -------------------------------- | --------------- |
| Engagement Rate      | (0_7_days / total) \* 100        | Gauge, KPI Card |
| At-Risk Users        | 31_90_days + 90plus_days         | KPI Card, Alert |
| Dormant Rate         | (never_logged_in / total) \* 100 | Gauge, KPI Card |
| Weekly Active Users  | 0_7_days                         | KPI Card        |
| Monthly Active Users | 0_7_days + 8_30_days             | KPI Card        |

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Detailed error message"
}
```

### Common Error Codes

| Status | Error                 | Description                            |
| ------ | --------------------- | -------------------------------------- |
| 400    | Bad Request           | Missing tenantId or invalid parameters |
| 400    | Validation Error      | Invalid date format or interval value  |
| 401    | Unauthorized          | Missing or invalid authentication      |
| 403    | Forbidden             | Insufficient role permissions          |
| 500    | Internal Server Error | Server-side error                      |

---

## Dashboard Layout Recommendation

```
+-----------------------------------------------------------+
|  [Total Users: 245]     [New Users (30d): 18]             |  <- KPI Cards
+-----------------------------------------------------------+
|  +---------------------+  +---------------------+         |
|  |   Users by Role     |  |   Users by Status   |         |  <- Pie Charts
|  |   (Donut Chart)     |  |   (Donut Chart)     |         |
|  +---------------------+  +---------------------+         |
+-----------------------------------------------------------+
|  +---------------------------------------------------+    |
|  |   Registrations and Logins Over Time (Line)       |    |  <- Time Series
|  +---------------------------------------------------+    |
+-----------------------------------------------------------+
|  +---------------------+  +---------------------+         |
|  |  Users by Dept      |  |   Login Recency     |         |  <- Bar Charts
|  |  (Horizontal Bar)   |  |   (Stacked Bar)     |         |
|  +---------------------+  +---------------------+         |
+-----------------------------------------------------------+
```

---

## Recommended Chart Types

The following chart types are the most common and ideal for HR analytics dashboards. These provide the best balance of clarity, usability, and visual appeal.

### Primary Charts

| Chart Type           | Best For                                   | Data Type     | When to Use                                                     |
| -------------------- | ------------------------------------------ | ------------- | --------------------------------------------------------------- |
| KPI Card             | Single metrics (totals, counts)            | Scalar values | Displaying headline numbers like total users or new users       |
| Donut Chart          | Proportional distribution (2-6 categories) | Categorical   | Showing role distribution, status breakdown, engagement buckets |
| Line Chart           | Trends over time                           | Time series   | Visualizing registrations or logins over days/weeks/months      |
| Horizontal Bar Chart | Ranked comparisons (many categories)       | Categorical   | Comparing user counts across departments or positions           |
| Area Chart           | Volume trends over time                    | Time series   | Showing cumulative growth or highlighting magnitude of change   |

### Selection Guidelines

| Number of Categories | Recommended Chart             |
| -------------------- | ----------------------------- |
| 1 value              | KPI Card or Gauge             |
| 2-5 categories       | Donut Chart or Pie Chart      |
| 6-12 categories      | Horizontal Bar Chart          |
| 12+ categories       | Horizontal Bar Chart (top 10) |
| Time-based data      | Line Chart or Area Chart      |

### Chart Pairing Recommendations

| Use Case                  | Chart Combination                              |
| ------------------------- | ---------------------------------------------- |
| Overview dashboard header | 2 KPI Cards (Total Users, New Users)           |
| Distribution analysis     | 2 Donut Charts side by side (Role, Status)     |
| Trend analysis            | Dual Line Chart (Registrations + Logins)       |
| Engagement monitoring     | Donut Chart + KPI Card (Recency + Active Rate) |
| Departmental breakdown    | Horizontal Bar Chart with department labels    |

---

## Technical Notes

### Raw SQL Usage

The `/registrations` and `/logins` endpoints use raw SQL queries with PostgreSQL's `date_trunc()` function for time-based grouping. This is intentional as Prisma's `groupBy` does not support computed date expressions.

### Tenant Isolation

All queries are scoped to the authenticated user's tenant via `tenantId` filtering, ensuring complete data isolation in the multi-tenant architecture.

---

## Version History

| Version | Date       | Changes                |
| ------- | ---------- | ---------------------- |
| 1.0.0   | 2024-12-21 | Initial implementation |
