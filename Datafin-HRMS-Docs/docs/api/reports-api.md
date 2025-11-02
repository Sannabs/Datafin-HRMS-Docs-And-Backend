# Reports & Dashboards API Documentation

## Base Endpoint
```
/api/v1/reports
```

---

## Dashboards

### HR Dashboard

**GET** `/api/v1/reports/dashboard/hr`

Returns aggregated HR metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "headcount": {
      "total": 150,
      "active": 145,
      "on_leave": 5
    },
    "attrition": {
      "rate": 5.2,
      "this_month": 3,
      "last_month": 2
    },
    "hiring": {
      "this_month": 8,
      "pending_offers": 5
    },
    "leave": {
      "pending_requests": 12,
      "approved_this_month": 45
    },
    "recent_activity": [
      {
        "type": "new_hire",
        "employee": "John Doe",
        "timestamp": "2025-01-15T10:00:00Z"
      }
    ]
  }
}
```

### Management Dashboard

**GET** `/api/v1/reports/dashboard/management`

Returns high-level management metrics.

**Response:**
```json
{
  "success": true,
  "data": {
    "headcount_summary": {
      "total": 150,
      "by_department": [
        {"department": "Engineering", "count": 45},
        {"department": "Sales", "count": 30}
      ]
    },
    "payroll_cost": {
      "monthly": 1200000.00,
      "ytd": 14400000.00,
      "trend": "stable"
    },
    "attrition_summary": {
      "quarterly_rate": 15.5,
      "departments_at_risk": ["Engineering", "Sales"]
    }
  }
}
```

---

## Employee Reports

### Headcount Report

**GET** `/api/v1/reports/headcount`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `as_of_date` | date | No | Snapshot date |
| `group_by` | enum | No | department, position, type |

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "breakdown": [
      {
        "group": "Engineering",
        "count": 45,
        "percentage": 30.0
      }
    ],
    "generated_at": "2025-01-15T10:30:00Z"
  }
}
```

### Employee List

**GET** `/api/v1/reports/employees`

**Query Parameters:**
Standard filtering parameters.

**Response:**
```json
{
  "success": true,
  "data": {
    "employees": [/* employee data */],
    "total": 150,
    "filters_applied": {
      "department": "Engineering",
      "status": "active"
    }
  }
}
```

---

## Leave Reports

### Leave Trends

**GET** `/api/v1/reports/leave/trends`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | Yes | Report start date |
| `end_date` | date | Yes | Report end date |

**Response:**
```json
{
  "success": true,
  "data": {
    "total_leaves": 450,
    "average_days_per_request": 3.5,
    "by_type": [
      {"leave_type": "Annual Leave", "count": 200},
      {"leave_type": "Sick Leave", "count": 150}
    ],
    "monthly_trend": [
      {"month": "Jan", "count": 50},
      {"month": "Feb", "count": 45}
    ]
  }
}
```

### Leave Balance Report

**GET** `/api/v1/reports/leave/balance`

Returns leave balance summary across all employees.

**Response:**
```json
{
  "success": true,
  "data": {
    "total_available": 2500.0,
    "total_used": 1800.0,
    "total_accrued": 2000.0,
    "by_department": [
      {
        "department": "Engineering",
        "available": 500.0,
        "used": 300.0
      }
    ]
  }
}
```

---

## Payroll Reports

### Payroll Cost Report

**GET** `/api/v1/reports/payroll/cost`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pay_period_id` | UUID | No | Specific pay period |
| `group_by` | enum | No | department, position |

**Response:**
```json
{
  "success": true,
  "data": {
    "total_gross": 1500000.00,
    "total_deductions": 450000.00,
    "total_net": 1050000.00,
    "breakdown": [
      {
        "group": "Engineering",
        "gross": 500000.00,
        "employees": 45
      }
    ]
  }
}
```

### Payroll Summary

**GET** `/api/v1/reports/payroll/summary`

Returns payroll summary for a date range.

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "2025-01-01 to 2025-01-31",
    "total_runs": 2,
    "total_employees": 150,
    "total_paid": 2100000.00,
    "tax_breakdown": {
      "income_tax": 600000.00,
      "social_security": 200000.00
    }
  }
}
```

---

## Performance Reports

### Performance Distribution

**GET** `/api/v1/reports/performance/distribution`

**Response:**
```json
{
  "success": true,
  "data": {
    "average_rating": 3.8,
    "distribution": [
      {"rating": "5.0", "count": 20},
      {"rating": "4.0", "count": 50},
      {"rating": "3.0", "count": 60}
    ],
    "by_department": [
      {
        "department": "Engineering",
        "average": 4.2
      }
    ]
  }
}
```

---

## Attendance Reports

### Attendance Summary

**GET** `/api/v1/reports/attendance/summary`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | Yes | Start date |
| `end_date` | date | Yes | End date |

**Response:**
```json
{
  "success": true,
  "data": {
    "total_employees": 150,
    "average_hours": 160.5,
    "attendance_rate": 96.5,
    "by_status": {
      "present": 4350,
      "absent": 100,
      "late": 50
    }
  }
}
```

---

## Custom Reports

### Generate Custom Report

**POST** `/api/v1/reports/custom`

**Request Body:**
```json
{
  "report_type": "employee_list",
  "columns": ["employee_code", "name", "department", "position"],
  "filters": {
    "department": "Engineering",
    "status": "active"
  },
  "format": "pdf"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "export_id": "exp_550e8400",
    "status": "processing",
    "estimated_completion": "2025-01-15T10:35:00Z"
  }
}
```

### Get Export Status

**GET** `/api/v1/reports/exports/{export_id}`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "completed",
    "download_url": "https://api.datafinhrms.com/v1/reports/exports/exp_550e8400/file",
    "expires_at": "2025-01-16T10:30:00Z"
  }
}
```

---

## Export Formats

Supported export formats:
- `csv` - CSV file
- `pdf` - PDF document
- `excel` - Excel spreadsheet

---

## Permissions

### Required Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| GET /reports/dashboard/* | `reports:read` |
| GET /reports/* | `reports:read` |
| POST /reports/custom | `reports:create` |

### Access Rules

- HR Officers: Full access to all reports
- Department Heads: Access to department-level reports
- Management: Access to management dashboards
- Auditors: Read-only access to all reports

