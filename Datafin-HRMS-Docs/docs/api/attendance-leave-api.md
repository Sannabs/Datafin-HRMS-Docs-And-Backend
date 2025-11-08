# Attendance & Leave API Documentation

## Base Endpoint
```
/api/v1/attendance
```

---

## Attendance Records

### List Attendance Records

**GET** `/api/v1/attendance/records`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `employee_id` | UUID | No | Filter by employee |
| `start_date` | date | No | Filter start date |
| `end_date` | date | No | Filter end date |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "att_550e8400",
      "employee_id": "emp_550e8400",
      "attendance_date": "2025-01-15",
      "check_in_time": "09:00:00",
      "check_out_time": "17:30:00",
      "hours_worked": 8.5,
      "attendance_status": "present"
    }
  ]
}
```

### Create Attendance Record

**POST** `/api/v1/attendance/records`

**Request Body:**
```json
{
  "employee_id": "emp_550e8400",
  "attendance_date": "2025-01-20",
  "check_in_time": "09:00:00",
  "check_out_time": "17:30:00"
}
```

**Response:** `201 Created`

---

## Leave Types

### List Leave Types

**GET** `/api/v1/leave/types`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "lt_550e8400",
      "name": "Annual Leave",
      "code": "AL",
      "max_days_per_year": 20,
      "carry_forward": true,
      "max_carry_forward": 5,
      "requires_approval": true
    }
  ]
}
```

---

## Leave Requests

### List Leave Requests

**GET** `/api/v1/leave/requests`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter[status]` | enum | No | pending, approved, rejected |
| `filter[employee]` | UUID | No | Filter by employee |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "lr_550e8400",
      "employee": {
        "id": "emp_550e8400",
        "name": "John Doe"
      },
      "leave_type": {
        "id": "lt_550e8400",
        "name": "Annual Leave"
      },
      "start_date": "2025-02-01",
      "end_date": "2025-02-05",
      "days_requested": 5.0,
      "status": "pending",
      "submitted_at": "2025-01-15T10:00:00Z"
    }
  ]
}
```

### Submit Leave Request

**POST** `/api/v1/leave/requests`

**Request Body:**
```json
{
  "leave_type_id": "lt_550e8400",
  "start_date": "2025-02-01",
  "end_date": "2025-02-05",
  "reason": "Family vacation"
}
```

**Response:** `201 Created`

**Errors:**
- `400`: Insufficient leave balance
- `409`: Overlapping leave request exists

---

### Approve Leave Request

**POST** `/api/v1/leave/requests/{request_id}/approve`

**Request Body:**
```json
{
  "notes": "Approved"
}
```

**Response:** `200 OK`

### Reject Leave Request

**POST** `/api/v1/leave/requests/{request_id}/reject`

**Request Body:**
```json
{
  "notes": "Insufficient notice period"
}
```

**Response:** `200 OK`

---

## Leave Balances

### Get Employee Leave Balance

**GET** `/api/v1/employees/{employee_id}/leave-balances`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "leave_type": {
        "id": "lt_550e8400",
        "name": "Annual Leave",
        "code": "AL"
      },
      "year": 2025,
      "opening_balance": 5.0,
      "accrued": 1.67,
      "used": 3.0,
      "closing_balance": 3.67
    }
  ]
}
```

---

## Permissions

### Required Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| GET /attendance/records | `attendance:read` |
| POST /attendance/records | `attendance:create` |
| GET /leave/requests | `leave:read` |
| POST /leave/requests | `leave:create` |
| POST /leave/requests/{id}/approve | `leave:approve` |

### Access Rules

- Employees can view only their own attendance and leave records
- Managers can view their team's records
- HR Officers have full access

