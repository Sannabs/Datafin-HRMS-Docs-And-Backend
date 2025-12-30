# Payroll API Documentation

## Base Endpoints
```
/api/allowance-types
/api/deduction-types
/api/salary-structures
/api/pay-periods
/api/payroll-runs
/api/payslips
```

**Authentication:** All endpoints require authentication via `requireAuth` middleware  
**Authorization:** Role-based access control via `requireRole` middleware

---

## Allowance Types

### List All Allowance Types

**GET** `/api/allowance-types`

**Access:** HR_ADMIN, HR_STAFF

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "at_550e8400",
      "name": "Transportation",
      "code": "TRANS",
      "isTaxable": true,
      "tenantId": "tenant_123"
    }
  ]
}
```

### Get Allowance Type by ID

**GET** `/api/allowance-types/:id`

**Access:** HR_ADMIN, HR_STAFF

### Create Allowance Type

**POST** `/api/allowance-types`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "name": "Housing Allowance",
  "code": "HOUSING",
  "isTaxable": true
}
```

### Update Allowance Type

**PUT** `/api/allowance-types/:id`

**Access:** HR_ADMIN

### Delete Allowance Type

**DELETE** `/api/allowance-types/:id`

**Access:** HR_ADMIN

---

## Deduction Types

### List All Deduction Types

**GET** `/api/deduction-types`

**Access:** HR_ADMIN, HR_STAFF

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "dt_550e8400",
      "name": "Income Tax",
      "code": "TAX",
      "isStatutory": true,
      "tenantId": "tenant_123"
    }
  ]
}
```

### Get Deduction Type by ID

**GET** `/api/deduction-types/:id`

**Access:** HR_ADMIN, HR_STAFF

### Create Deduction Type

**POST** `/api/deduction-types`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "name": "Health Insurance",
  "code": "HEALTH",
  "isStatutory": false
}
```

### Update Deduction Type

**PUT** `/api/deduction-types/:id`

**Access:** HR_ADMIN

### Delete Deduction Type

**DELETE** `/api/deduction-types/:id`

**Access:** HR_ADMIN

---

## Salary Structures

### Get My Salary Structure (Employee Self-Service)

**GET** `/api/salary-structures/me/salary-structure`

**Access:** All authenticated users (returns own structure)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ss_550e8400",
    "baseSalary": 80000.00,
    "grossSalary": 100000.00,
    "effectiveDate": "2024-01-01T00:00:00Z",
    "endDate": null,
    "currency": "USD",
    "allowances": [
      {
        "id": "all_550e8400",
        "allowanceType": {
          "id": "at_123",
          "name": "Transportation",
          "code": "TRANS",
          "isTaxable": true
        },
        "amount": 5000.00,
        "calculationMethod": "FIXED"
      }
    ],
    "deductions": [
      {
        "id": "ded_550e8400",
        "deductionType": {
          "id": "dt_123",
          "name": "Income Tax",
          "code": "TAX",
          "isStatutory": true
        },
        "amount": 20000.00,
        "calculationMethod": "PERCENTAGE"
      }
    ]
  }
}
```

### Get My Salary Structure History

**GET** `/api/salary-structures/me/salary-structures`

**Access:** All authenticated users (returns own history)

### Get Employee Salary Structure (HR View)

**GET** `/api/salary-structures/employees/:id/salary-structure`

**Access:** HR_ADMIN, HR_STAFF

### Get Employee Salary Structure History

**GET** `/api/salary-structures/employees/:id/salary-structures`

**Access:** HR_ADMIN, HR_STAFF

### Create Salary Structure

**POST** `/api/salary-structures/employees/:id/salary-structure`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "baseSalary": 85000.00,
  "effectiveDate": "2025-02-01",
  "endDate": null,
  "currency": "USD",
  "allowances": [
    {
      "allowanceTypeId": "at_123",
      "amount": 5000.00,
      "calculationMethod": "FIXED"
    }
  ],
  "deductions": [
    {
      "deductionTypeId": "dt_123",
      "amount": 15.0,
      "calculationMethod": "PERCENTAGE"
    }
  ]
}
```

### Update Salary Structure

**PUT** `/api/salary-structures/salary-structures/:id`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "baseSalary": 90000.00,
  "effectiveDate": "2025-03-01",
  "currency": "USD"
}
```

### Delete Salary Structure

**DELETE** `/api/salary-structures/salary-structures/:id`

**Access:** HR_ADMIN

**Note:** Soft delete - sets `endDate` to current date

### Add Allowance to Structure

**POST** `/api/salary-structures/salary-structures/:id/allowances`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "allowanceTypeId": "at_123",
  "amount": 3000.00,
  "calculationMethod": "FIXED"
}
```

### Remove Allowance from Structure

**DELETE** `/api/salary-structures/salary-structures/:id/allowances/:allowanceId`

**Access:** HR_ADMIN

### Add Deduction to Structure

**POST** `/api/salary-structures/salary-structures/:id/deductions`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "deductionTypeId": "dt_123",
  "amount": 10.0,
  "calculationMethod": "PERCENTAGE"
}
```

### Remove Deduction from Structure

**DELETE** `/api/salary-structures/salary-structures/:id/deductions/:deductionId`

**Access:** HR_ADMIN

---

## Pay Periods

### List Pay Periods

**GET** `/api/pay-periods`

**Access:** HR_ADMIN, HR_STAFF

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status (DRAFT, PROCESSING, COMPLETED, CLOSED) |
| `fromDate` | date | Filter from date |
| `toDate` | date | Filter to date |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pp_550e8400",
      "periodName": "January 2025",
      "startDate": "2025-01-01T00:00:00Z",
      "endDate": "2025-01-31T23:59:59Z",
      "calendarMonth": 1,
      "calendarYear": 2025,
      "status": "PROCESSING",
      "payrollRunSummary": {
        "totalRuns": 1,
        "statusCounts": { "COMPLETED": 1 },
        "totalEmployees": 150,
        "totalGrossPay": 1200000.00,
        "totalNetPay": 900000.00
      }
    }
  ],
  "count": 1
}
```

### Get Pay Period by ID

**GET** `/api/pay-periods/:id`

**Access:** HR_ADMIN, HR_STAFF

### Create Pay Period

**POST** `/api/pay-periods`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "periodName": "February 2025",
  "startDate": "2025-02-01",
  "endDate": "2025-02-28"
}
```

**Note:** `calendarMonth` and `calendarYear` are auto-calculated

### Update Pay Period Status

**PATCH** `/api/pay-periods/:id/status`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "status": "COMPLETED"
}
```

**Valid Status Transitions:**
- DRAFT → PROCESSING → COMPLETED → CLOSED
- State machine validates transitions

### Pause Auto-Close

**POST** `/api/pay-periods/:id/pause-auto-close`

**Access:** HR_ADMIN

**Note:** Prevents automatic closing of pay period

### Resume Auto-Close

**POST** `/api/pay-periods/:id/resume-auto-close`

**Access:** HR_ADMIN

### Delete Pay Period

**DELETE** `/api/pay-periods/:id`

**Access:** HR_ADMIN

**Note:** Only allowed if status is DRAFT and no payroll runs exist

---

## Payroll Runs

### List Payroll Runs

**GET** `/api/payroll-runs`

**Access:** HR_ADMIN, HR_STAFF

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `payPeriodId` | UUID | Filter by pay period |
| `status` | string | Filter by status (DRAFT, PROCESSING, COMPLETED, FAILED) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "pr_550e8400",
      "payPeriodId": "pp_550e8400",
      "payPeriod": {
        "id": "pp_550e8400",
        "periodName": "January 2025",
        "startDate": "2025-01-01T00:00:00Z",
        "endDate": "2025-01-31T23:59:59Z",
        "status": "PROCESSING"
      },
      "status": "COMPLETED",
      "totalEmployees": 150,
      "totalGrossPay": 1200000.00,
      "totalDeductions": 300000.00,
      "totalNetPay": 900000.00,
      "processedBy": "user_123",
      "processor": {
        "id": "user_123",
        "name": "John Admin"
      },
      "runDate": "2025-01-31T23:00:00Z",
      "processedAt": "2025-01-31T23:05:00Z"
    }
  ],
  "count": 1
}
```

### Get Payroll Run by ID

**GET** `/api/payroll-runs/:id`

**Access:** HR_ADMIN, HR_STAFF

### Create Payroll Run

**POST** `/api/payroll-runs`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "payPeriodId": "pp_550e8400",
  "employeeIds": ["emp_123", "emp_456"]
}
```

**Note:** If `employeeIds` is omitted or empty, processes all active employees

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "pr_550e8400",
    "status": "DRAFT",
    "totalEmployees": 0
  },
  "message": "Payroll run created successfully"
}
```

### Preview Payroll Run

**POST** `/api/payroll-runs/preview`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "payPeriodId": "pp_550e8400",
  "employeeIds": ["emp_123"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "eligibleCount": 150,
    "warnings": [
      {
        "employeeId": "emp_123",
        "name": "John Doe",
        "message": "No active salary structure found"
      }
    ],
    "estimatedTotals": {
      "totalGrossPay": 1200000.00,
      "totalNetPay": 900000.00
    }
  }
}
```

### Start Payroll Run

**POST** `/api/payroll-runs/:id/start`

**Access:** HR_ADMIN

**Note:** Moves run from DRAFT to PROCESSING and begins asynchronous processing

**Response:**
```json
{
  "success": true,
  "data": {
    "payrollRunId": "pr_550e8400",
    "status": "PROCESSING",
    "employeeCount": 150,
    "jobId": "job_123"
  }
}
```

### Process Single Employee

**POST** `/api/payroll-runs/:id/process-employee`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "employeeId": "emp_123"
}
```

**Note:** Processes a single employee in an existing payroll run

### Get Payroll Run Status

**GET** `/api/payroll-runs/:id/status`

**Access:** HR_ADMIN, HR_STAFF

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "PROCESSING",
    "progress": {
      "completed": 75,
      "total": 150,
      "percentage": 50.0,
      "currentEmployee": "emp_123"
    },
    "estimatedCompletion": "2025-01-31T23:05:00Z"
  }
}
```

### Get Payroll Run Status Stream (SSE)

**GET** `/api/payroll-runs/:id/status/stream`

**Access:** HR_ADMIN, HR_STAFF

**Content-Type:** `text/event-stream`

**Note:** Server-Sent Events for real-time progress updates

### Get Payroll Job Status (BullMQ)

**GET** `/api/payroll-runs/:id/job-status`

**Access:** HR_ADMIN, HR_STAFF

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "job_123",
    "state": "active",
    "progress": 50,
    "returnvalue": null,
    "failedReason": null
  }
}
```

### Retry Payroll Job

**POST** `/api/payroll-runs/:id/retry`

**Access:** HR_ADMIN

**Note:** Retries a failed payroll job

### Get Queue Configuration

**GET** `/api/payroll-runs/queue/config`

**Access:** HR_ADMIN

### Get Queue Metrics

**GET** `/api/payroll-runs/queue/metrics`

**Access:** HR_ADMIN

---

## Payslips

### Get All Payslips (HR View)

**GET** `/api/payslips`

**Access:** HR_ADMIN, HR_STAFF

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `payrollRunId` | UUID | Filter by payroll run |
| `payPeriodId` | UUID | Filter by pay period |
| `employeeId` | UUID | Filter by employee |
| `startDate` | date | Filter start date |
| `endDate` | date | Filter end date |
| `search` | string | Search by employee name or ID |
| `page` | number | Page number (pagination) |
| `limit` | number | Items per page |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ps_550e8400",
      "payrollRunId": "pr_550e8400",
      "userId": "emp_123",
      "user": {
        "id": "emp_123",
        "name": "John Doe",
        "employeeId": "EMP001"
      },
      "grossSalary": 100000.00,
      "totalAllowances": 5000.00,
      "totalDeductions": 20000.00,
      "netSalary": 85000.00,
      "hasWarnings": false,
      "warnings": null,
      "generatedAt": "2025-01-31T23:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Get Payslip by ID

**GET** `/api/payslips/:id`

**Access:** HR_ADMIN, HR_STAFF, EMPLOYEE (own payslips only)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ps_550e8400",
    "payrollRun": {
      "id": "pr_550e8400",
      "payPeriod": {
        "id": "pp_550e8400",
        "periodName": "January 2025",
        "startDate": "2025-01-01T00:00:00Z",
        "endDate": "2025-01-31T23:59:59Z"
      }
    },
    "user": {
      "id": "emp_123",
      "name": "John Doe",
      "employeeId": "EMP001"
    },
    "grossSalary": 100000.00,
    "totalAllowances": 5000.00,
    "totalDeductions": 20000.00,
    "netSalary": 85000.00,
    "hasWarnings": false,
    "isAdjustment": false,
    "filePath": "payslips/ps_550e8400.pdf",
    "generatedAt": "2025-01-31T23:00:00Z"
  }
}
```

### Download Payslip PDF

**GET** `/api/payslips/:id/download`

**Access:** HR_ADMIN, HR_STAFF, EMPLOYEE (own payslips only)

**Response:** PDF file (Content-Type: application/pdf)

### Get Employee Payslips

**GET** `/api/payslips/employee/:employeeId`

**Access:** HR_ADMIN, HR_STAFF, EMPLOYEE (own payslips only)

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `payPeriodId` | UUID | Filter by pay period |
| `startDate` | date | Filter start date |
| `endDate` | date | Filter end date |

### Get Payslips by Payroll Run

**GET** `/api/payslips/payroll-run/:runId`

**Access:** HR_ADMIN, HR_STAFF

### Bulk Download Payslips (ZIP)

**GET** `/api/payslips/payroll-run/:runId/bulk-download`

**Access:** HR_ADMIN, HR_STAFF

**Response:** ZIP file containing all payslip PDFs for the payroll run

### Export Payslips

**POST** `/api/payslips/export`

**Access:** HR_ADMIN, HR_STAFF

**Request Body:**
```json
{
  "format": "csv",
  "payrollRunId": "pr_550e8400",
  "payPeriodId": "pp_550e8400",
  "startDate": "2025-01-01",
  "endDate": "2025-01-31"
}
```

**Supported Formats:** `csv`, `json`

**Response (CSV):** CSV file download  
**Response (JSON):**
```json
{
  "exportedAt": "2025-01-31T23:00:00Z",
  "totalRecords": 150,
  "data": [
    {
      "Employee ID": "EMP001",
      "Employee Name": "John Doe",
      "Pay Period": "January 2025",
      "Gross Salary": "100000.00",
      "Net Salary": "85000.00"
    }
  ]
}
```

### Distribute Payslips via Email

**POST** `/api/payslips/payroll-run/:runId/distribute`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "sendToAll": true,
  "employeeIds": ["emp_123", "emp_456"]
}
```

**Note:** Sends payslip PDFs via email to employees

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSent": 150,
    "failed": 0,
    "results": [
      {
        "employeeId": "emp_123",
        "email": "john@example.com",
        "status": "sent"
      }
    ]
  }
}
```

### Get Distribution Report

**GET** `/api/payslips/payroll-run/:runId/distribution-report`

**Access:** HR_ADMIN, HR_STAFF

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPayslips": 150,
    "emailSent": 145,
    "emailFailed": 5,
    "downloads": 120,
    "distributionStatus": [
      {
        "employeeId": "emp_123",
        "name": "John Doe",
        "emailSent": true,
        "emailSentAt": "2025-01-31T23:00:00Z",
        "downloaded": true,
        "downloadedAt": "2025-02-01T10:00:00Z"
      }
    ]
  }
}
```

### Create Adjustment Payslip

**POST** `/api/payslips/:id/adjustment`

**Access:** HR_ADMIN

**Request Body:**
```json
{
  "adjustmentType": "CORRECTION",
  "adjustmentReason": "Incorrect base salary used",
  "grossSalary": 105000.00,
  "totalAllowances": 5000.00,
  "totalDeductions": 20000.00,
  "netSalary": 90000.00
}
```

**Adjustment Types:**
- `CORRECTION` - Fix incorrect values
- `SUPPLEMENT` - Add to original amounts
- `REVERSAL` - Reverse original payslip
- `AMENDMENT` - Modify original values

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "ps_550e8401",
    "isAdjustment": true,
    "adjustmentType": "CORRECTION",
    "adjustmentReason": "Incorrect base salary used",
    "originalPayslipId": "ps_550e8400",
    "previousGrossSalary": 100000.00,
    "previousNetSalary": 85000.00,
    "grossSalary": 105000.00,
    "netSalary": 90000.00
  },
  "message": "Adjustment payslip created successfully"
}
```

### Get Payslip Adjustments

**GET** `/api/payslips/:id/adjustments`

**Access:** HR_ADMIN, HR_STAFF, EMPLOYEE (own payslips only)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "ps_550e8401",
      "adjustmentType": "CORRECTION",
      "adjustmentReason": "Incorrect base salary used",
      "grossSalary": 105000.00,
      "netSalary": 90000.00,
      "createdAt": "2025-02-01T10:00:00Z"
    }
  ]
}
```

---

## Role-Based Access Summary

| Endpoint Category | HR_ADMIN | HR_STAFF | EMPLOYEE |
|-------------------|----------|----------|----------|
| Allowance Types | Full CRUD | Read | None |
| Deduction Types | Full CRUD | Read | None |
| Salary Structures | Full CRUD | Read | Own only |
| Pay Periods | Full CRUD | Read | None |
| Payroll Runs | Full CRUD | Read | None |
| Payslips | Full Access | Read | Own only |

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Detailed error message here"
}
```

**Common HTTP Status Codes:**
- `200 OK` - Success
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Not authenticated
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., concurrent payroll run)
- `500 Internal Server Error` - Server error

---

## Notes

1. **Date Formats:** All dates are in ISO 8601 format (e.g., `2025-01-31T23:00:00Z`)
2. **Currency:** Default currency is USD, but can be configured per salary structure
3. **Pagination:** List endpoints support `page` and `limit` query parameters
4. **Real-time Updates:** Use SSE endpoint (`/status/stream`) for live progress tracking
5. **File Downloads:** PDF and ZIP downloads return binary content with appropriate Content-Type headers
6. **Audit Trail:** All actions are logged in the audit log system

---

*Last Updated: 2025-01-XX*  
*API Version: 1.0*
