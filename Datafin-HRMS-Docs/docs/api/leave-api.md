# Leave Management API Documentation

## Base Endpoint
```
/api/leave
```

**Authentication:** All endpoints require authentication via `requireAuth` middleware.

---

## Leave Policy

### Get Leave Policy

**GET** `/api/leave/policy`

Get the tenant's leave policy configuration.

**Access:** All authenticated users

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave policy fetched successfully",
  "data": {
    "id": "policy_550e8400",
    "tenantId": "tenant_550e8400",
    "defaultDaysPerYear": 20,
    "accrualMethod": "FRONT_LOADED",
    "accrualFrequency": null,
    "accrualDaysPerPeriod": null,
    "carryoverType": "LIMITED",
    "maxCarryoverDays": 5,
    "carryoverExpiryMonths": 3,
    "encashmentRate": null,
    "advanceNoticeDays": 7,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-01T00:00:00Z"
  }
}
```

### Update Leave Policy

**PATCH** `/api/leave/policy`

Update the tenant's leave policy configuration.

**Access:** `HR_ADMIN` only

**Request Body:**
```json
{
  "defaultDaysPerYear": 25,
  "accrualMethod": "ACCRUAL",
  "accrualFrequency": "MONTHLY",
  "accrualDaysPerPeriod": 2.08,
  "carryoverType": "FULL",
  "maxCarryoverDays": null,
  "carryoverExpiryMonths": null,
  "encashmentRate": null,
  "advanceNoticeDays": 14
}
```

**Field Validations:**
- `accrualMethod`: Must be `"FRONT_LOADED"` or `"ACCRUAL"`
- `accrualFrequency`: Required if `accrualMethod` is `"ACCRUAL"`. Must be `"MONTHLY"`, `"QUARTERLY"`, or `"ANNUALLY"`
- `accrualDaysPerPeriod`: Required if `accrualMethod` is `"ACCRUAL"`. Must be a non-negative number
- `carryoverType`: Must be `"NONE"`, `"FULL"`, `"LIMITED"`, or `"ENCASHMENT"`
- `maxCarryoverDays`: Required if `carryoverType` is `"LIMITED"`. Must be a non-negative number
- `encashmentRate`: Required if `carryoverType` is `"ENCASHMENT"`. Must be a non-negative number
- `advanceNoticeDays`: Must be a non-negative integer

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave policy updated successfully",
  "data": {
    "id": "policy_550e8400",
    "tenantId": "tenant_550e8400",
    "defaultDaysPerYear": 25,
    "accrualMethod": "ACCRUAL",
    "accrualFrequency": "MONTHLY",
    "accrualDaysPerPeriod": 2.08,
    "carryoverType": "FULL",
    "maxCarryoverDays": null,
    "carryoverExpiryMonths": null,
    "encashmentRate": null,
    "advanceNoticeDays": 14,
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z"
  }
}
```

---

## Leave Types

### List Leave Types

**GET** `/api/leave/types`

Get all leave types for the tenant.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `isActive` | boolean | No | Filter by active status (`true`/`false`) |

**Access:** All authenticated users

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave types fetched successfully",
  "data": [
    {
      "id": "lt_550e8400",
      "tenantId": "tenant_550e8400",
      "name": "Annual Leave",
      "description": "Standard annual leave",
      "color": "#3B82F6",
      "isPaid": true,
      "deductsFromAnnual": true,
      "requiresDocument": false,
      "isActive": true,
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-01T00:00:00Z",
      "deletedAt": null,
      "_count": {
        "leaveRequests": 15
      }
    }
  ],
  "count": 1
}
```

### Create Leave Type

**POST** `/api/leave/types`

Create a new leave type.

**Access:** `HR_ADMIN` only

**Request Body:**
```json
{
  "name": "Sick Leave",
  "description": "Medical leave with documentation",
  "color": "#EF4444",
  "isPaid": true,
  "deductsFromAnnual": false,
  "requiresDocument": true,
  "isActive": true
}
```

**Field Validations:**
- `name`: Required, non-empty string
- `color`: Optional, must be valid hex color code (e.g., `#FF5733`)
- `isPaid`: Boolean, defaults to `true`
- `deductsFromAnnual`: Boolean, defaults to `true`
- `requiresDocument`: Boolean, defaults to `false`
- `isActive`: Boolean, defaults to `true`

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Leave type created successfully",
  "data": {
    "id": "lt_550e8401",
    "tenantId": "tenant_550e8400",
    "name": "Sick Leave",
    "description": "Medical leave with documentation",
    "color": "#EF4444",
    "isPaid": true,
    "deductsFromAnnual": false,
    "requiresDocument": true,
    "isActive": true,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "deletedAt": null
  }
}
```

### Update Leave Type

**PATCH** `/api/leave/types/:id`

Update an existing leave type.

**Access:** `HR_ADMIN` only

**Request Body:** (All fields optional)
```json
{
  "name": "Medical Leave",
  "description": "Updated description",
  "color": "#DC2626",
  "isPaid": false,
  "deductsFromAnnual": false,
  "requiresDocument": true,
  "isActive": true
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave type updated successfully",
  "data": {
    "id": "lt_550e8401",
    "tenantId": "tenant_550e8400",
    "name": "Medical Leave",
    "description": "Updated description",
    "color": "#DC2626",
    "isPaid": false,
    "deductsFromAnnual": false,
    "requiresDocument": true,
    "isActive": true,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T11:00:00Z",
    "deletedAt": null
  }
}
```

### Delete Leave Type

**DELETE** `/api/leave/types/:id`

Soft delete a leave type. Cannot delete if used in leave requests.

**Access:** `HR_ADMIN` only

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave type deleted successfully",
  "data": {
    "id": "lt_550e8401",
    "deletedAt": "2025-01-15T12:00:00Z",
    "isActive": false
  }
}
```

**Error Response:** `400 Bad Request` (if leave type is used in requests)
```json
{
  "success": false,
  "error": "Bad Request",
  "message": "Cannot delete leave type. It is currently used in leave requests.",
  "data": {
    "usedInRequests": 5
  }
}
```

---

## Leave Requests

### Get My Leave Requests

**GET** `/api/leave/requests/my`

Get all leave requests for the authenticated user.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 10, max: 100) |

**Access:** All authenticated users (returns only their own requests)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave requests fetched successfully",
  "data": [
    {
      "id": "lr_550e8400",
      "tenantId": "tenant_550e8400",
      "userId": "user_550e8400",
      "leaveTypeId": "lt_550e8400",
      "startDate": "2025-02-01T00:00:00Z",
      "endDate": "2025-02-05T00:00:00Z",
      "totalDays": 5,
      "reason": "Family vacation",
      "attachments": [],
      "status": "PENDING",
      "managerId": "manager_550e8400",
      "managerApprovedAt": null,
      "hrId": null,
      "hrApprovedAt": null,
      "rejectedBy": null,
      "rejectedAt": null,
      "rejectionReason": null,
      "cancelledAt": null,
      "createdAt": "2025-01-15T10:00:00Z",
      "updatedAt": "2025-01-15T10:00:00Z",
      "leaveType": {
        "id": "lt_550e8400",
        "name": "Annual Leave",
        "description": "Standard annual leave",
        "color": "#3B82F6",
        "isPaid": true,
        "deductsFromAnnual": true,
        "requiresDocument": false,
        "isActive": true,
        "deletedAt": null
      },
      "manager": {
        "id": "manager_550e8400",
        "name": "Jane Manager",
        "email": "jane@example.com",
        "employeeId": "EMP001"
      },
      "hr": null,
      "rejectedByUser": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 15,
    "totalPages": 2,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Get Pending Leave Requests for Manager Approval

**GET** `/api/leave/requests/pending/manager`

Get all pending leave requests assigned to the authenticated manager.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 10, max: 100) |

**Access:** All authenticated users (returns only requests where user is the assigned manager)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Pending leave requests fetched successfully",
  "data": [
    {
      "id": "lr_550e8400",
      "startDate": "2025-02-01T00:00:00Z",
      "endDate": "2025-02-05T00:00:00Z",
      "totalDays": 5,
      "reason": "Family vacation",
      "status": "PENDING",
      "createdAt": "2025-01-15T10:00:00Z",
      "leaveType": {
        "id": "lt_550e8400",
        "name": "Annual Leave",
        "color": "#3B82F6"
      },
      "user": {
        "id": "user_550e8400",
        "name": "John Doe",
        "employeeId": "EMP123",
        "department": {
          "name": "Engineering"
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

### Get All Leave Requests (HR Only)

**GET** `/api/leave/requests`

Get all leave requests for the tenant with filtering options.

**Access:** `HR_ADMIN`, `HR_STAFF` only

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 20, max: 100) |
| `status` | string | No | Filter by status: `PENDING`, `MANAGER_APPROVED`, `APPROVED`, `REJECTED`, `CANCELLED` |
| `awaitingHrApproval` | boolean | No | Filter for requests awaiting HR approval (`true`) |
| `employeeId` | string | No | Filter by employee user ID |
| `leaveTypeId` | string | No | Filter by leave type ID |
| `startDate` | date | No | Filter start date (requests overlapping with date range) |
| `endDate` | date | No | Filter end date (requests overlapping with date range) |

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave requests fetched successfully",
  "data": [
    {
      "id": "lr_550e8400",
      "startDate": "2025-02-01T00:00:00Z",
      "endDate": "2025-02-05T00:00:00Z",
      "totalDays": 5,
      "reason": "Family vacation",
      "status": "MANAGER_APPROVED",
      "createdAt": "2025-01-15T10:00:00Z",
      "leaveType": {
        "id": "lt_550e8400",
        "name": "Annual Leave",
        "color": "#3B82F6"
      },
      "user": {
        "id": "user_550e8400",
        "name": "John Doe",
        "employeeId": "EMP123",
        "department": {
          "name": "Engineering"
        }
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

### Get Leave Request by ID

**GET** `/api/leave/requests/:id`

Get detailed information about a specific leave request.

**Access:** 
- Employees can view their own requests
- Managers can view requests they're assigned to approve
- HR can view all requests

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave request fetched successfully",
  "data": {
    "id": "lr_550e8400",
    "tenantId": "tenant_550e8400",
    "userId": "user_550e8400",
    "leaveTypeId": "lt_550e8400",
    "startDate": "2025-02-01T00:00:00Z",
    "endDate": "2025-02-05T00:00:00Z",
    "totalDays": 5,
    "reason": "Family vacation",
    "attachments": ["https://storage.example.com/leave-requests/attachment.pdf"],
    "status": "APPROVED",
    "managerId": "manager_550e8400",
    "managerApprovedAt": "2025-01-16T09:00:00Z",
    "hrId": "hr_550e8400",
    "hrApprovedAt": "2025-01-16T14:00:00Z",
    "rejectedBy": null,
    "rejectedAt": null,
    "rejectionReason": null,
    "cancelledAt": null,
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-16T14:00:00Z",
    "leaveType": {
      "id": "lt_550e8400",
      "name": "Annual Leave",
      "description": "Standard annual leave",
      "color": "#3B82F6",
      "isPaid": true,
      "deductsFromAnnual": true,
      "requiresDocument": false,
      "isActive": true
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "email": "john@example.com",
      "employeeId": "EMP123",
      "phone": "+1234567890",
      "department": {
        "id": "dept_550e8400",
        "name": "Engineering",
        "code": "ENG"
      },
      "position": {
        "id": "pos_550e8400",
        "title": "Senior Developer",
        "code": "SDEV"
      }
    },
    "manager": {
      "id": "manager_550e8400",
      "name": "Jane Manager",
      "email": "jane@example.com",
      "employeeId": "EMP001",
      "phone": "+1234567891"
    },
    "hr": {
      "id": "hr_550e8400",
      "name": "HR Admin",
      "email": "hr@example.com",
      "employeeId": "HR001",
      "phone": "+1234567892"
    },
    "rejectedByUser": null
  }
}
```

### Create Leave Request

**POST** `/api/leave/requests`

Submit a new leave request.

**Access:** All authenticated users

**Request Body:**
```json
{
  "startDate": "2025-02-01",
  "endDate": "2025-02-05",
  "reason": "Family vacation",
  "leaveTypeId": "lt_550e8400"
}
```

**File Upload (Optional):**
- Field name: `file` (single file)
- Supported formats: Images (JPEG, PNG, WebP, GIF)
- Max size: 5MB

**Field Validations:**
- `startDate`: Required, must be a valid date
- `endDate`: Required, must be a valid date, must be >= `startDate`
- `leaveTypeId`: Required, must be an active leave type
- `reason`: Optional string

**Business Rules:**
- Validates advance notice requirement from policy
- Checks for overlapping leave requests
- Validates available leave balance (if `deductsFromAnnual` is true)
- Calculates working days (excludes weekends and holidays)
- Automatically assigns manager based on user's department

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Leave request created successfully",
  "data": {
    "id": "lr_550e8400",
    "tenantId": "tenant_550e8400",
    "userId": "user_550e8400",
    "leaveTypeId": "lt_550e8400",
    "startDate": "2025-02-01T00:00:00Z",
    "endDate": "2025-02-05T00:00:00Z",
    "totalDays": 5,
    "reason": "Family vacation",
    "attachments": ["https://storage.example.com/leave-requests/attachment.pdf"],
    "status": "PENDING",
    "managerId": "manager_550e8400",
    "createdAt": "2025-01-15T10:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "leaveType": {
      "id": "lt_550e8400",
      "name": "Annual Leave"
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "email": "john@example.com",
      "employeeId": "EMP123"
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Insufficient leave balance, overlapping request, insufficient advance notice
- `404 Not Found`: Leave type not found or inactive

### Manager Approve Leave Request

**POST** `/api/leave/requests/:id/manager-approve`

Approve a leave request as manager (first tier of approval).

**Access:** `DEPARTMENT_ADMIN` only (must be the assigned manager)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave request approved by manager successfully",
  "data": {
    "id": "lr_550e8400",
    "status": "MANAGER_APPROVED",
    "managerId": "manager_550e8400",
    "managerApprovedAt": "2025-01-16T09:00:00Z",
    "updatedAt": "2025-01-16T09:00:00Z",
    "leaveType": {
      "id": "lt_550e8400",
      "name": "Annual Leave"
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "email": "john@example.com",
      "employeeId": "EMP123"
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Request is not in PENDING status
- `403 Forbidden`: User is not the assigned manager
- `404 Not Found`: Leave request not found

### HR Approve Leave Request

**POST** `/api/leave/requests/:id/hr-approve`

Approve a leave request as HR (second tier of approval). This finalizes the approval and updates the leave balance.

**Access:** `HR_ADMIN`, `HR_STAFF` only

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave request approved by HR successfully",
  "data": {
    "id": "lr_550e8400",
    "status": "APPROVED",
    "hrId": "hr_550e8400",
    "hrApprovedAt": "2025-01-16T14:00:00Z",
    "updatedAt": "2025-01-16T14:00:00Z",
    "leaveType": {
      "id": "lt_550e8400",
      "name": "Annual Leave"
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "email": "john@example.com",
      "employeeId": "EMP123"
    }
  }
}
```

**Business Rules:**
- Request must be in `MANAGER_APPROVED` status
- Updates leave balance: `pendingDays` decreases, `usedDays` increases (if `deductsFromAnnual` is true)
- Sends notification to employee

**Error Responses:**
- `400 Bad Request`: Request is not in MANAGER_APPROVED status
- `404 Not Found`: Leave request not found

### Reject Leave Request

**POST** `/api/leave/requests/:id/reject`

Reject a leave request.

**Access:** 
- `DEPARTMENT_ADMIN`: Can reject PENDING requests they're assigned to
- `HR_ADMIN`, `HR_STAFF`: Can reject any PENDING or MANAGER_APPROVED request

**Request Body:**
```json
{
  "rejectionReason": "Insufficient notice period. Please submit at least 7 days in advance."
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave request rejected successfully",
  "data": {
    "id": "lr_550e8400",
    "status": "REJECTED",
    "rejectedBy": "manager_550e8400",
    "rejectedAt": "2025-01-16T10:00:00Z",
    "rejectionReason": "Insufficient notice period. Please submit at least 7 days in advance.",
    "updatedAt": "2025-01-16T10:00:00Z",
    "leaveType": {
      "id": "lt_550e8400",
      "name": "Annual Leave"
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "email": "john@example.com",
      "employeeId": "EMP123"
    }
  }
}
```

**Business Rules:**
- Restores `pendingDays` if request was previously approved by manager
- Sends notification to employee with rejection reason

**Error Responses:**
- `400 Bad Request`: Request is already APPROVED, REJECTED, or CANCELLED
- `403 Forbidden`: User is not authorized to reject this request

### Cancel Leave Request

**POST** `/api/leave/requests/:id/cancel`

Cancel a leave request (employee can only cancel their own requests).

**Access:** All authenticated users (can only cancel their own requests)

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave request cancelled successfully",
  "data": {
    "id": "lr_550e8400",
    "status": "CANCELLED",
    "cancelledAt": "2025-01-16T11:00:00Z",
    "updatedAt": "2025-01-16T11:00:00Z",
    "leaveType": {
      "id": "lt_550e8400",
      "name": "Annual Leave"
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "email": "john@example.com",
      "employeeId": "EMP123"
    }
  }
}
```

**Business Rules:**
- Can only cancel PENDING or MANAGER_APPROVED requests
- Cannot cancel if already APPROVED, REJECTED, or CANCELLED
- Restores `pendingDays` if request was pending

**Error Responses:**
- `400 Bad Request`: Request cannot be cancelled (already approved/rejected/cancelled)
- `403 Forbidden`: User can only cancel their own requests

---

## Leave Balances

### Get My Leave Balance

**GET** `/api/leave/balance`

Get the authenticated user's leave balance for the current year.

**Access:** All authenticated users

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave balance fetched successfully",
  "data": {
    "id": "ent_550e8400",
    "tenantId": "tenant_550e8400",
    "userId": "user_550e8400",
    "policyId": "policy_550e8400",
    "year": 2025,
    "allocatedDays": 20,
    "accruedDays": 0,
    "carriedOverDays": 5,
    "adjustmentDays": 0,
    "usedDays": 8,
    "pendingDays": 2,
    "encashedDays": 0,
    "encashmentAmount": 0,
    "yearStartDate": "2025-01-01T00:00:00Z",
    "yearEndDate": "2025-12-31T23:59:59Z",
    "lastAccrualDate": null,
    "carryoverExpiryDate": "2025-03-31T23:59:59Z",
    "createdAt": "2025-01-01T00:00:00Z",
    "updatedAt": "2025-01-15T10:00:00Z",
    "availableBalance": 15,
    "policy": {
      "id": "policy_550e8400",
      "defaultDaysPerYear": 20,
      "accrualMethod": "FRONT_LOADED",
      "carryoverType": "LIMITED",
      "maxCarryoverDays": 5
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "employeeId": "EMP123"
    }
  }
}
```

**Balance Calculation:**
```
availableBalance = allocatedDays + accruedDays + carriedOverDays + adjustmentDays - usedDays - pendingDays
```

### Get Employee Leave Balance (HR Only)

**GET** `/api/leave/balance/:userId`

Get a specific employee's leave balance for the current year.

**Access:** `HR_ADMIN`, `HR_STAFF` only

**Response:** `200 OK` (Same structure as "Get My Leave Balance")

### Get All Leave Balances (HR Only)

**GET** `/api/leave/balances`

Get leave balances for all employees in the tenant.

**Access:** `HR_ADMIN`, `HR_STAFF` only

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `year` | integer | No | Year to fetch balances for (default: current year) |
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 50) |

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave balances fetched successfully",
  "data": [
    {
      "userId": "user_550e8400",
      "user": {
        "id": "user_550e8400",
        "name": "John Doe",
        "employeeId": "EMP123",
        "email": "john@example.com"
      },
      "year": 2025,
      "entitlement": {
        "id": "ent_550e8400",
        "policy": {
          "id": "policy_550e8400",
          "defaultDaysPerYear": 20,
          "accrualMethod": "FRONT_LOADED"
        },
        "yearStartDate": "2025-01-01T00:00:00Z",
        "yearEndDate": "2025-12-31T23:59:59Z",
        "lastAccrualDate": null,
        "carryoverExpiryDate": "2025-03-31T23:59:59Z"
      },
      "availableBalance": 15,
      "allocatedDays": 20,
      "accruedDays": 0,
      "carriedOverDays": 5,
      "adjustmentDays": 0,
      "usedDays": 8,
      "pendingDays": 2,
      "encashedDays": 0,
      "encashmentAmount": 0
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

### Adjust Leave Balance (HR Only)

**POST** `/api/leave/balance/:userId/adjust`

Manually adjust an employee's leave balance (add or subtract days).

**Access:** `HR_ADMIN` only

**Request Body:**
```json
{
  "adjustmentDays": 2,
  "reason": "Performance bonus - 2 extra leave days"
}
```

**Field Validations:**
- `adjustmentDays`: Required, number (can be positive or negative)
- `reason`: Optional string

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Leave balance adjusted successfully",
  "data": {
    "id": "ent_550e8400",
    "adjustmentDays": 2,
    "availableBalance": 17,
    "adjustment": {
      "previousAdjustmentDays": 0,
      "adjustmentAmount": 2,
      "newAdjustmentDays": 2,
      "reason": "Performance bonus - 2 extra leave days"
    },
    "policy": {
      "id": "policy_550e8400",
      "defaultDaysPerYear": 20,
      "accrualMethod": "FRONT_LOADED"
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "employeeId": "EMP123"
    }
  }
}
```

### Initialize Leave Entitlement (HR Only)

**POST** `/api/leave/balance/:userId/initialize`

Manually initialize a leave entitlement for an employee for a specific year.

**Access:** `HR_ADMIN` only

**Request Body:**
```json
{
  "year": 2025
}
```

**Field Validations:**
- `year`: Optional integer (defaults to current year)

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Leave entitlement initialized successfully",
  "data": {
    "id": "ent_550e8400",
    "tenantId": "tenant_550e8400",
    "userId": "user_550e8400",
    "policyId": "policy_550e8400",
    "year": 2025,
    "allocatedDays": 20,
    "accruedDays": 0,
    "carriedOverDays": 0,
    "adjustmentDays": 0,
    "usedDays": 0,
    "pendingDays": 0,
    "encashedDays": 0,
    "encashmentAmount": 0,
    "yearStartDate": "2025-01-01T00:00:00Z",
    "yearEndDate": "2025-12-31T23:59:59Z",
    "lastAccrualDate": null,
    "carryoverExpiryDate": "2025-03-31T23:59:59Z",
    "availableBalance": 20,
    "policy": {
      "id": "policy_550e8400",
      "defaultDaysPerYear": 20,
      "accrualMethod": "FRONT_LOADED"
    },
    "user": {
      "id": "user_550e8400",
      "name": "John Doe",
      "employeeId": "EMP123"
    }
  }
}
```

**Error Responses:**
- `400 Bad Request`: Entitlement for the year already exists

---

## Leave Request Status Flow

```
PENDING → MANAGER_APPROVED → APPROVED
   ↓              ↓
REJECTED      REJECTED
   ↓
CANCELLED
```

**Status Descriptions:**
- `PENDING`: Awaiting manager approval
- `MANAGER_APPROVED`: Manager approved, awaiting HR approval
- `APPROVED`: Fully approved by both manager and HR
- `REJECTED`: Rejected by manager or HR
- `CANCELLED`: Cancelled by employee

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message"
}
```

**Common HTTP Status Codes:**
- `400 Bad Request`: Validation error, invalid input
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

---

## Access Control Summary

| Endpoint | Employee | Manager | HR Staff | HR Admin |
|----------|----------|---------|----------|----------|
| GET `/api/leave/policy` | ✅ | ✅ | ✅ | ✅ |
| PATCH `/api/leave/policy` | ❌ | ❌ | ❌ | ✅ |
| GET `/api/leave/types` | ✅ | ✅ | ✅ | ✅ |
| POST `/api/leave/types` | ❌ | ❌ | ❌ | ✅ |
| PATCH `/api/leave/types/:id` | ❌ | ❌ | ❌ | ✅ |
| DELETE `/api/leave/types/:id` | ❌ | ❌ | ❌ | ✅ |
| GET `/api/leave/requests/my` | ✅ | ✅ | ✅ | ✅ |
| GET `/api/leave/requests/pending/manager` | ✅* | ✅* | ✅* | ✅* |
| GET `/api/leave/requests` | ❌ | ❌ | ✅ | ✅ |
| GET `/api/leave/requests/:id` | ✅** | ✅** | ✅ | ✅ |
| POST `/api/leave/requests` | ✅ | ✅ | ✅ | ✅ |
| POST `/api/leave/requests/:id/manager-approve` | ❌ | ✅*** | ❌ | ❌ |
| POST `/api/leave/requests/:id/hr-approve` | ❌ | ❌ | ✅ | ✅ |
| POST `/api/leave/requests/:id/reject` | ❌ | ✅**** | ✅ | ✅ |
| POST `/api/leave/requests/:id/cancel` | ✅** | ✅** | ✅** | ✅** |
| GET `/api/leave/balance` | ✅ | ✅ | ✅ | ✅ |
| GET `/api/leave/balance/:userId` | ❌ | ❌ | ✅ | ✅ |
| GET `/api/leave/balances` | ❌ | ❌ | ✅ | ✅ |
| POST `/api/leave/balance/:userId/adjust` | ❌ | ❌ | ❌ | ✅ |
| POST `/api/leave/balance/:userId/initialize` | ❌ | ❌ | ❌ | ✅ |

**Notes:**
- *: Returns only requests where user is the assigned manager
- **: Can only access their own requests
- ***: Must be the assigned manager for the request
- ****: Can only reject requests they're assigned to (if PENDING)

---

## Scheduled Jobs (Not Yet Implemented)

The following automated jobs are planned but not yet implemented:

1. **Leave Accrual Job** - Runs 1st of each month at 1:00 AM
   - Process monthly/quarterly accruals for employees with ACCRUAL method
   - Update `accruedDays` based on `accrualFrequency` and `accrualDaysPerPeriod`

2. **Year-End Processing Job** - Runs Jan 1st at 00:05 AM
   - Initialize new year entitlements for all existing employees
   - Process carryover from previous year (FULL, LIMITED, ENCASHMENT)
   - Create entitlements for the new year

3. **Leave Ending Notification Job** - Runs daily at 8:00 AM
   - Notify employees whose approved leave ends soon (e.g., tomorrow or in 1-3 days)
   - Query approved leave requests with `endDate` in the near future

4. **Carryover Expiry Check** - Runs 1st of each month at 2:00 AM
   - Forfeit expired carryover days based on `carryoverExpiryDate`

---

## Notes

- All dates are in ISO 8601 format (UTC)
- Working days calculation excludes weekends and holidays
- Leave balance is calculated on-the-fly, not stored
- Entitlements are created lazily (on first access) or proactively (on invitation acceptance)
- Policy changes affect new entitlements only, existing entitlements remain unchanged
- File attachments are optional and stored in cloud storage (R2)
