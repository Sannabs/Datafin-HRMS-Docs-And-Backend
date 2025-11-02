# Performance Management API Documentation

## Base Endpoint
```
/api/v1/performance
```

---

## Goals

### List Employee Goals

**GET** `/api/v1/employees/{employee_id}/goals`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter[status]` | enum | No | not_started, in_progress, completed |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "goal_550e8400",
      "goal_title": "Complete Project Alpha",
      "description": "Launch new product feature",
      "goal_type": "individual",
      "target_date": "2025-03-31",
      "status": "in_progress",
      "progress_percentage": 65.0
    }
  ]
}
```

### Create Goal

**POST** `/api/v1/employees/{employee_id}/goals`

**Request Body:**
```json
{
  "goal_title": "Complete Project Alpha",
  "description": "Launch new product feature",
  "goal_type": "individual",
  "target_date": "2025-03-31"
}
```

**Response:** `201 Created`

### Update Goal Progress

**PATCH** `/api/v1/goals/{goal_id}`

**Request Body:**
```json
{
  "progress_percentage": 75.0,
  "status": "in_progress"
}
```

**Response:** `200 OK`

---

## Appraisals

### List Appraisals

**GET** `/api/v1/appraisals`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employee_id` | UUID | No | Filter by employee |
| `filter[status]` | enum | No | draft, in_progress, completed |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "appr_550e8400",
      "employee": {
        "id": "emp_550e8400",
        "name": "John Doe"
      },
      "appraiser": {
        "id": "emp_660e8400",
        "name": "Jane Smith"
      },
      "appraisal_period_start": "2024-01-01",
      "appraisal_period_end": "2024-12-31",
      "overall_rating": 4.5,
      "status": "completed",
      "appraisal_date": "2025-01-15"
    }
  ]
}
```

### Create Appraisal

**POST** `/api/v1/appraisals`

**Request Body:**
```json
{
  "employee_id": "emp_550e8400",
  "appraisal_period_start": "2024-01-01",
  "appraisal_period_end": "2024-12-31"
}
```

**Response:** `201 Created`

### Get Appraisal Details

**GET** `/api/v1/appraisals/{appraisal_id}`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "appr_550e8400",
    "employee": { /* employee details */ },
    "appraiser": { /* appraiser details */ },
    "overall_rating": 4.5,
    "ratings": [
      {
        "id": "rat_550e8400",
        "criteria_name": "Technical Skills",
        "rating_value": 4.5,
        "comments": "Excellent"
      }
    ],
    "feedback": [
      {
        "given_by": { /* person details */ },
        "feedback_text": "Great team player",
        "relationship_type": "peer"
      }
    ],
    "status": "completed"
  }
}
```

---

## Feedback

### Submit Feedback

**POST** `/api/v1/appraisals/{appraisal_id}/feedback`

**Request Body:**
```json
{
  "feedback_text": "Great team player, always willing to help",
  "relationship_type": "peer",
  "feedback_type_id": "ft_550e8400"
}
```

**Response:** `201 Created`

---

## Permissions

### Required Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| GET /employees/{id}/goals | `performance:read` |
| POST /employees/{id}/goals | `performance:create` |
| GET /appraisals | `performance:read` |
| POST /appraisals | `performance:create` |
| POST /appraisals/{id}/feedback | `performance:create` |

