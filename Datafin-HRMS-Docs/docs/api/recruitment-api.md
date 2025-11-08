# Recruitment & Onboarding API Documentation

## Base Endpoint
```
/api/v1/recruitment
```

---

## Job Postings

### List Job Postings

**GET** `/api/v1/recruitment/job-postings`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter[status]` | enum | No | draft, posted, closed, cancelled |
| `filter[department]` | UUID | No | Filter by department |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "job_550e8400",
      "job_code": "JOB-2025-001",
      "title": "Senior Software Engineer",
      "description": "Join our dynamic engineering team...",
      "department": {
        "id": "660e8400",
        "name": "Engineering"
      },
      "status": "posted",
      "posting_date": "2025-01-15",
      "closing_date": "2025-02-15",
      "applicant_count": 45
    }
  ]
}
```

### Create Job Posting

**POST** `/api/v1/recruitment/job-postings`

**Request Body:**
```json
{
  "title": "Senior Software Engineer",
  "description": "Join our dynamic engineering team...",
  "department_id": "660e8400",
  "position_id": "770e8400",
  "employment_type": "full_time",
  "experience_required": "5+ years",
  "qualifications": "Bachelor's in CS or related field",
  "posting_date": "2025-01-20",
  "closing_date": "2025-02-20"
}
```

**Response:** `201 Created`

---

## Applicants

### List Applicants

**GET** `/api/v1/recruitment/job-postings/{job_id}/applicants`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter[status]` | enum | No | applied, screening, interview, offered, hired, rejected |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "app_550e8400",
      "first_name": "Alice",
      "last_name": "Johnson",
      "email": "alice@example.com",
      "status": "interview",
      "total_score": 85.5,
      "applied_date": "2025-01-16"
    }
  ]
}
```

### Create Applicant

**POST** `/api/v1/recruitment/job-postings/{job_id}/applicants`

**Content-Type:** `multipart/form-data`

**Form Data:**
| Field | Type | Required |
|-------|------|----------|
| `first_name` | string | Yes |
| `last_name` | string | Yes |
| `email` | string | Yes |
| `phone` | string | No |
| `resume` | file | Yes |

**Response:** `201 Created`

---

## Interviews

### List Interviews

**GET** `/api/v1/recruitment/applicants/{applicant_id}/interviews`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "int_550e8400",
      "interview_type": "in_person",
      "interview_date": "2025-01-25",
      "interview_time": "14:00:00",
      "location": "Conference Room A",
      "score": 90.0,
      "status": "completed"
    }
  ]
}
```

### Create Interview

**POST** `/api/v1/recruitment/applicants/{applicant_id}/interviews`

**Request Body:**
```json
{
  "interviewer_id": "emp_550e8400",
  "interview_type": "in_person",
  "interview_date": "2025-01-25",
  "interview_time": "14:00:00",
  "location": "Conference Room A"
}
```

**Response:** `201 Created`

---

## Offers

### Get Offer

**GET** `/api/v1/recruitment/applicants/{applicant_id}/offer`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "off_550e8400",
    "offered_salary": 120000.00,
    "offer_date": "2025-01-28",
    "acceptance_deadline": "2025-02-04",
    "status": "pending",
    "offer_letter_path": "/documents/offers/off_550e8400.pdf"
  }
}
```

### Create Offer

**POST** `/api/v1/recruitment/applicants/{applicant_id}/offer`

**Request Body:**
```json
{
  "offered_salary": 120000.00,
  "acceptance_deadline": "2025-02-04"
}
```

**Response:** `201 Created`

---

## Onboarding

### List Onboarding Tasks

**GET** `/api/v1/onboarding/tasks`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "task_550e8400",
      "task_name": "Complete Employee Handbook",
      "description": "Read and acknowledge company policies",
      "sequence_order": 1,
      "task_type": "orientation",
      "is_required": true
    }
  ]
}
```

### Get Employee Onboarding Status

**GET** `/api/v1/employees/{employee_id}/onboarding`

**Response:**
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "task_id": "task_550e8400",
        "task_name": "Complete Employee Handbook",
        "status": "completed",
        "completed_at": "2025-01-20T10:00:00Z"
      }
    ],
    "completion_percentage": 45.0,
    "total_tasks": 20,
    "completed_tasks": 9
  }
}
```

### Mark Task Complete

**POST** `/api/v1/employees/{employee_id}/onboarding/tasks/{task_id}/complete`

**Response:** `200 OK`

