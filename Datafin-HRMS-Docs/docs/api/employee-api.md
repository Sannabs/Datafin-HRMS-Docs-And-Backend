# Employee API Documentation

## Base Endpoint
```
/api/v1/employees
```

---

## Endpoints

### List Employees

**GET** `/api/v1/employees`

Returns a paginated list of employees.

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 20) |
| `filter[department]` | string | No | Filter by department ID |
| `filter[position]` | string | No | Filter by position ID |
| `filter[status]` | enum | No | Filter by employment_status |
| `filter[name]` | string | No | Search by name |
| `sort` | string | No | Sort field (e.g., `name`, `hire_date`) |
| `order` | enum | No | `asc` or `desc` (default: `asc`) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "employee_code": "EMP001",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john.doe@company.com",
      "phone": "+1234567890",
      "department": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "Engineering"
      },
      "position": {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "title": "Senior Software Engineer"
      },
      "employment_status": "active",
      "hire_date": "2020-01-15"
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "total_pages": 8
    }
  }
}
```

---

### Get Employee by ID

**GET** `/api/v1/employees/{id}`

Returns detailed information about a specific employee.

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | UUID | Yes | Employee ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "employee_code": "EMP001",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@company.com",
    "phone": "+1234567890",
    "date_of_birth": "1985-05-15",
    "gender": "male",
    "address": "123 Main St",
    "city": "San Francisco",
    "state": "CA",
    "country": "USA",
    "postal_code": "94105",
    "department": {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Engineering"
    },
    "position": {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "title": "Senior Software Engineer"
    },
    "manager": {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "name": "Jane Smith"
    },
    "employment_status": "active",
    "employee_type": "full_time",
    "hire_date": "2020-01-15",
    "emergency_contact_name": "Sarah Doe",
    "emergency_contact_phone": "+1234567891",
    "created_at": "2020-01-15T00:00:00Z",
    "updated_at": "2025-01-15T10:30:00Z"
  }
}
```

---

### Create Employee

**POST** `/api/v1/employees`

Creates a new employee.

**Request Body:**
```json
{
  "first_name": "John",
  "last_name": "Doe",
  "email": "john.doe@company.com",
  "phone": "+1234567890",
  "date_of_birth": "1985-05-15",
  "gender": "male",
  "address": "123 Main St",
  "city": "San Francisco",
  "state": "CA",
  "country": "USA",
  "postal_code": "94105",
  "department_id": "660e8400-e29b-41d4-a716-446655440001",
  "position_id": "770e8400-e29b-41d4-a716-446655440002",
  "manager_id": "880e8400-e29b-41d4-a716-446655440003",
  "employment_status": "active",
  "employee_type": "full_time",
  "hire_date": "2025-01-20",
  "emergency_contact_name": "Sarah Doe",
  "emergency_contact_phone": "+1234567891"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "employee_code": "EMP001",
    /* Full employee object */
  }
}
```

**Errors:**
- `422`: Validation error (duplicate email, missing required fields)
- `409`: Employee with email already exists

---

### Update Employee

**PUT** `/api/v1/employees/{id}`

Full update of an employee (replace entire resource).

**PATCH** `/api/v1/employees/{id}`

Partial update of an employee (update only specified fields).

**Request Body (PATCH example):**
```json
{
  "phone": "+1987654321",
  "address": "456 New St"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    /* Updated employee object */
  }
}
```

**Errors:**
- `404`: Employee not found
- `422`: Validation error

---

### Delete Employee

**DELETE** `/api/v1/employees/{id}`

Soft deletes an employee (sets employment_status to 'terminated').

**Response:** `204 No Content`

**Errors:**
- `404`: Employee not found
- `409`: Cannot delete employee with active records

---

## Employee Documents

### List Employee Documents

**GET** `/api/v1/employees/{id}/documents`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "doc_550e8400",
      "document_type": "resume",
      "file_name": "resume.pdf",
      "file_size": 245760,
      "mime_type": "application/pdf",
      "uploaded_at": "2025-01-10T08:00:00Z"
    }
  ]
}
```

### Upload Employee Document

**POST** `/api/v1/employees/{id}/documents`

**Content-Type:** `multipart/form-data`

**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | Document file |
| `document_type` | string | Yes | Document type (resume, contract, certificate, etc.) |

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "doc_550e8400",
    "document_type": "resume",
    "file_name": "resume.pdf",
    "file_path": "/documents/550e8400/resume.pdf",
    "file_size": 245760,
    "mime_type": "application/pdf",
    "uploaded_at": "2025-01-15T10:30:00Z"
  }
}
```

### Download Employee Document

**GET** `/api/v1/employees/{id}/documents/{document_id}/download`

Returns the file with appropriate content-type headers.

---

## Employee Dependents

### List Employee Dependents

**GET** `/api/v1/employees/{id}/dependents`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "dep_550e8400",
      "first_name": "Jane",
      "last_name": "Doe",
      "relationship": "child",
      "date_of_birth": "2015-08-20",
      "phone": "+1234567892"
    }
  ]
}
```

### Create Dependent

**POST** `/api/v1/employees/{id}/dependents`

**Request Body:**
```json
{
  "first_name": "Jane",
  "last_name": "Doe",
  "relationship": "child",
  "date_of_birth": "2015-08-20",
  "phone": "+1234567892"
}
```

**Response:** `201 Created`

---

## Departments

### List Departments

**GET** `/api/v1/departments`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "Engineering",
      "description": "Software Development",
      "manager": {
        "id": "880e8400-e29b-41d4-a716-446655440003",
        "name": "Jane Smith"
      },
      "employee_count": 45
    }
  ]
}
```

### Get Department

**GET** `/api/v1/departments/{id}`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Engineering",
    "description": "Software Development",
    "manager": {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "name": "Jane Smith",
      "email": "jane.smith@company.com"
    },
    "positions": [
      {
        "id": "770e8400-e29b-41d4-a716-446655440002",
        "title": "Senior Software Engineer",
        "employee_count": 15
      }
    ],
    "employee_count": 45
  }
}
```

---

## Positions

### List Positions

**GET** `/api/v1/positions`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `filter[department]` | UUID | No | Filter by department ID |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "title": "Senior Software Engineer",
      "description": "Lead development of enterprise applications",
      "department": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "Engineering"
      },
      "employee_count": 15
    }
  ]
}
```

---

## Permissions

### Required Permissions

| Endpoint | Required Permission |
|----------|---------------------|
| GET /employees | `employee:read` |
| GET /employees/{id} | `employee:read` |
| POST /employees | `employee:create` |
| PUT/PATCH /employees/{id} | `employee:update` |
| DELETE /employees/{id} | `employee:delete` |
| POST /employees/{id}/documents | `employee:update` |

### Resource-Level Access

- STAFF can only read their own data
- HR_STAFF can read all employee data
- DEPARTMENT_ADMIN can read their department's data (plus own data)
- HR_ADMIN has full access

