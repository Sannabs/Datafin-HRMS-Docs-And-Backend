# Payroll API Documentation

## Base Endpoint
```
/api/v1/payroll
```

---

## Salary Structures

### Get Employee Salary Structure

**GET** `/api/v1/employees/{employee_id}/salary-structure`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ss_550e8400",
    "base_salary": 80000.00,
    "gross_salary": 100000.00,
    "effective_date": "2024-01-01",
    "end_date": null,
    "currency": "USD",
    "allowances": [
      {
        "id": "all_550e8400",
        "allowance_type": "Transportation",
        "amount": 5000.00,
        "is_taxable": true
      }
    ],
    "deductions": [
      {
        "id": "ded_550e8400",
        "deduction_type": "Income Tax",
        "amount": 20000.00,
        "is_statutory": true
      }
    ]
  }
}
```

### Update Salary Structure

**PATCH** `/api/v1/employees/{employee_id}/salary-structure`

**Request Body:**
```json
{
  "base_salary": 85000.00,
  "gross_salary": 105000.00,
  "effective_date": "2025-02-01"
}
```

**Response:** `200 OK`

---

## Pay Periods

### List Pay Periods

**GET** `/api/v1/payroll/pay-periods`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pp_550e8400",
      "period_name": "January 2025",
      "start_date": "2025-01-01",
      "end_date": "2025-01-31",
      "calendar_month": 1,
      "calendar_year": 2025,
      "status": "processing"
    }
  ]
}
```

### Create Pay Period

**POST** `/api/v1/payroll/pay-periods`

**Request Body:**
```json
{
  "period_name": "February 2025",
  "start_date": "2025-02-01",
  "end_date": "2025-02-28",
  "calendar_month": 2,
  "calendar_year": 2025
}
```

**Response:** `201 Created`

---

## Payroll Runs

### List Payroll Runs

**GET** `/api/v1/payroll/runs`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pr_550e8400",
      "pay_period": {
        "id": "pp_550e8400",
        "period_name": "January 2025"
      },
      "run_date": "2025-01-31",
      "total_employees": 150,
      "total_gross_pay": 1200000.00,
      "total_deductions": 300000.00,
      "total_net_pay": 900000.00,
      "status": "completed",
      "processed_at": "2025-01-31T23:00:00Z"
    }
  ]
}
```

### Process Payroll

**POST** `/api/v1/payroll/runs`

**Request Body:**
```json
{
  "pay_period_id": "pp_550e8400",
  "employee_ids": ["emp_550e8400", "emp_660e8400"]
}
```

**Response:** `201 Created`

**Note:** This is an asynchronous operation. Use the returned run ID to check status.

### Get Payroll Run Status

**GET** `/api/v1/payroll/runs/{run_id}/status`

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "processing",
    "progress": {
      "completed": 75,
      "total": 150,
      "percentage": 50.0
    },
    "estimated_completion": "2025-01-31T23:05:00Z"
  }
}
```

---

## Payslips

### Get Employee Payslips

**GET** `/api/v1/employees/{employee_id}/payslips`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pay_period_id` | UUID | No | Filter by pay period |
| `start_date` | date | No | Filter start date |
| `end_date` | date | No | Filter end date |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ps_550e8400",
      "payroll_run": {
        "id": "pr_550e8400",
        "period_name": "January 2025"
      },
      "gross_salary": 100000.00,
      "total_allowances": 5000.00,
      "total_deductions": 20000.00,
      "net_salary": 85000.00,
      "generated_at": "2025-01-31"
    }
  ]
}
```

### Download Payslip

**GET** `/api/v1/payslips/{payslip_id}/download`

Returns PDF file.

---

## Export Payroll

### Export Payroll Data

**POST** `/api/v1/payroll/runs/{run_id}/export`

**Request Body:**
```json
{
  "format": "csv",
  "include_details": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "export_id": "exp_550e8400",
    "status": "processing",
    "download_url": null
  }
}
```

### Get Export File

**GET** `/api/v1/payroll/exports/{export_id}`

Returns the export file once ready.

---

## Permissions

### Required Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| GET /employees/{id}/salary-structure | `payroll:read` |
| PATCH /employees/{id}/salary-structure | `payroll:update` |
| POST /payroll/runs | `payroll:create` |
| GET /employees/{id}/payslips | `payroll:read` (own) or `payroll:read_all` |

