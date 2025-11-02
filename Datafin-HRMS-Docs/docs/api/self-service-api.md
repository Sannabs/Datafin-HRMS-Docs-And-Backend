# Employee Self-Service API Documentation

## Base Endpoint
```
/api/v1/self-service
```

---

## Profile Management

### Get My Profile

**GET** `/api/v1/self-service/profile`

Returns the authenticated employee's profile.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "emp_550e8400",
    "employee_code": "EMP001",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@company.com",
    "phone": "+1234567890",
    "department": {
      "name": "Engineering"
    },
    "position": {
      "title": "Senior Software Engineer"
    },
    "manager": {
      "name": "Jane Smith"
    }
  }
}
```

### Update My Profile

**PATCH** `/api/v1/self-service/profile`

**Request Body:**
```json
{
  "phone": "+1987654321",
  "address": "456 New Street",
  "city": "San Francisco"
}
```

**Response:** `200 OK`

**Note:** Certain fields (like department, position, salary) cannot be self-updated.

---

## Leave Requests

### My Leave Requests

**GET** `/api/v1/self-service/leave-requests`

Returns all leave requests for the authenticated employee.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "lr_550e8400",
      "leave_type": {
        "name": "Annual Leave"
      },
      "start_date": "2025-02-01",
      "end_date": "2025-02-05",
      "days_requested": 5.0,
      "status": "approved"
    }
  ]
}
```

### Submit Leave Request

**POST** `/api/v1/self-service/leave-requests`

**Request Body:**
```json
{
  "leave_type_id": "lt_550e8400",
  "start_date": "2025-03-01",
  "end_date": "2025-03-05",
  "reason": "Personal leave"
}
```

**Response:** `201 Created`

---

## Payslips

### My Payslips

**GET** `/api/v1/self-service/payslips`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `year` | integer | No | Filter by year |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ps_550e8400",
      "pay_period": {
        "period_name": "January 2025"
      },
      "net_salary": 85000.00,
      "generated_at": "2025-01-31"
    }
  ]
}
```

### Download My Payslip

**GET** `/api/v1/self-service/payslips/{payslip_id}/download`

Returns PDF file.

---

## Attendance

### My Attendance

**GET** `/api/v1/self-service/attendance`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | No | Filter start date |
| `end_date` | date | No | Filter end date |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "attendance_date": "2025-01-15",
      "check_in_time": "09:00:00",
      "check_out_time": "17:30:00",
      "hours_worked": 8.5,
      "attendance_status": "present"
    }
  ]
}
```

---

## Leave Balance

### My Leave Balance

**GET** `/api/v1/self-service/leave-balance`

**Response:**
```json
{
  "success": true,
  "data": {
    "leave_types": [
      {
        "leave_type": "Annual Leave",
        "available": 15.0,
        "pending": 5.0,
        "used": 5.0,
        "total": 20.0
      }
    ]
  }
}
```

---

## Performance

### My Goals

**GET** `/api/v1/self-service/goals`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "goal_title": "Complete Project Alpha",
      "target_date": "2025-03-31",
      "status": "in_progress",
      "progress_percentage": 65.0
    }
  ]
}
```

### My Appraisals

**GET** `/api/v1/self-service/appraisals`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "appraisal_period": "2024-01-01 to 2024-12-31",
      "overall_rating": 4.5,
      "status": "completed",
      "appraisal_date": "2025-01-15"
    }
  ]
}
```

---

## Training

### My Training

**GET** `/api/v1/self-service/training`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "course": "Introduction to React",
      "status": "completed",
      "score": 95.0,
      "completed_date": "2025-01-10"
    }
  ]
}
```

---

## Dashboard

### My Dashboard

**GET** `/api/v1/self-service/dashboard`

Returns aggregated information for the employee dashboard.

**Response:**
```json
{
  "success": true,
  "data": {
    "leave_balance": {
      "total_available": 15.0
    },
    "recent_payslips": [/* 3 most recent */],
    "upcoming_training": [/* assigned training */],
    "pending_goals": [/* goals in progress */]
  }
}
```

---

## Security

All self-service endpoints:
- Require authentication
- Automatically scoped to the authenticated employee
- Cannot access other employees' data
- Rate limited to prevent abuse

