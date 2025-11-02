# API Overview

## Table of Contents

1. [Introduction](#introduction)
2. [Base URL and Environment](#base-url-and-environment)
3. [Authentication](#authentication)
4. [Common Request/Response Patterns](#common-requestresponse-patterns)
5. [Error Handling](#error-handling)
6. [Rate Limiting](#rate-limiting)
7. [Pagination](#pagination)
8. [Filtering and Sorting](#filtering-and-sorting)
9. [Best Practices](#best-practices)

---

## Introduction

The Datafin HRMS API is a RESTful API that provides programmatic access to all HRMS functionality. All requests and responses use JSON format, and all timestamps are in ISO 8601 format with timezone (UTC).

### API Versioning

The API uses URL-based versioning:
- Current version: `v1`
- Production endpoint: `https://api.datafinhrms.com/v1`
- Development endpoint: `https://dev-api.datafinhrms.com/v1`

### Supported HTTP Methods

- `GET` - Retrieve resources
- `POST` - Create new resources
- `PUT` - Update entire resources (full replacement)
- `PATCH` - Partial update of resources
- `DELETE` - Delete resources

---

## Base URL and Environment

### Environments

| Environment | Base URL | Purpose |
|-------------|----------|---------|
| Production | `https://api.datafinhrms.com/v1` | Live system |
| Staging | `https://staging-api.datafinhrms.com/v1` | Pre-production testing |
| Development | `https://dev-api.datafinhrms.com/v1` | Development and testing |

### Content-Type

All requests must include the `Content-Type: application/json` header.

---

## Authentication

### Overview

The API uses **Better Auth** with JWT tokens for authentication. All API requests require a valid authentication token.

### Authentication Flow

#### 1. Login

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "email": "user@company.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "refresh_token_string_here",
    "expires_in": 3600,
    "token_type": "Bearer",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@company.com",
      "roles": ["employee"]
    }
  }
}
```

#### 2. Including Token in Requests

Include the access token in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 3. Token Refresh

When the access token expires, use the refresh token to get a new access token.

**Endpoint:** `POST /auth/refresh`

**Request:**
```json
{
  "refresh_token": "refresh_token_string_here"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "new_token_here",
    "expires_in": 3600
  }
}
```

#### 4. Logout

**Endpoint:** `POST /auth/logout`

**Request Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Password Reset

#### Request Password Reset

**Endpoint:** `POST /auth/forgot-password`

**Request:**
```json
{
  "email": "user@company.com"
}
```

#### Reset Password

**Endpoint:** `POST /auth/reset-password`

**Request:**
```json
{
  "token": "reset_token_from_email",
  "new_password": "NewSecurePassword123!"
}
```

---

## Common Request/Response Patterns

### Standard Request Headers

```
Content-Type: application/json
Authorization: Bearer {access_token}
X-Request-ID: {optional_unique_request_id}
Accept: application/json
```

### Success Response Format

All successful API responses follow this structure:

```json
{
  "success": true,
  "data": {
    /* Resource data here */
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

For paginated responses:

```json
{
  "success": true,
  "data": [/* array of resources */],
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "total_pages": 8,
      "has_next": true,
      "has_previous": false
    }
  }
}
```

### Resource Links (HATEOAS)

Some responses include resource links for navigation:

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "John Doe",
    "links": {
      "self": "/api/v1/employees/550e8400-e29b-41d4-a716-446655440000",
      "department": "/api/v1/departments/660e8400-e29b-41d4-a716-446655440001",
      "payroll": "/api/v1/payroll/employees/550e8400-e29b-41d4-a716-446655440000"
    }
  }
}
```

---

## Error Handling

### Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": [
      {
        "field": "field_name",
        "message": "Field-specific error message"
      }
    ]
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

### HTTP Status Codes

| Status Code | Meaning | Description |
|-------------|---------|-------------|
| 200 | OK | Success |
| 201 | Created | Resource created successfully |
| 204 | No Content | Success with no response body |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate) |
| 422 | Unprocessable Entity | Validation errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Error Codes

#### Authentication Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Invalid email or password |
| `AUTH_TOKEN_EXPIRED` | 401 | Access token expired |
| `AUTH_TOKEN_INVALID` | 401 | Invalid access token |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |

#### Validation Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 422 | General validation error |
| `REQUIRED_FIELD_MISSING` | 422 | Required field not provided |
| `INVALID_FORMAT` | 422 | Invalid data format |
| `INVALID_DATE_RANGE` | 422 | Invalid date range |

#### Resource Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RESOURCE_NOT_FOUND` | 404 | Requested resource not found |
| `RESOURCE_ALREADY_EXISTS` | 409 | Resource already exists |
| `RESOURCE_CONFLICT` | 409 | Resource in conflict |

#### Business Logic Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INSUFFICIENT_LEAVE_BALANCE` | 400 | Not enough leave balance |
| `PAYROLL_ALREADY_PROCESSED` | 409 | Payroll already processed for period |
| `APPROVAL_REQUIRED` | 400 | Approval required before action |

#### System Errors

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INTERNAL_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |

### Example Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [
      {
        "field": "email",
        "message": "Email is required"
      },
      {
        "field": "phone",
        "message": "Phone number must be 10 digits"
      }
    ]
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

#### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "Your session has expired. Please log in again."
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "AUTH_INSUFFICIENT_PERMISSIONS",
    "message": "You do not have permission to access this resource."
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

#### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Employee not found"
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400"
  }
}
```

---

## Rate Limiting

### Limits

| User Type | Limit | Window |
|-----------|-------|--------|
| Standard User | 1000 requests | 1 hour |
| HR Officer | 5000 requests | 1 hour |
| Admin | 10000 requests | 1 hour |

### Rate Limit Headers

All API responses include rate limit headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642248000
```

### Exceeding Rate Limits

When rate limit is exceeded, API returns:

**Status:** `429 Too Many Requests`

**Response:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please try again later."
  },
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400",
    "rate_limit": {
      "reset_at": "2025-01-15T11:30:00Z"
    }
  }
}
```

---

## Pagination

### Pagination Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `limit` | integer | 20 | Items per page |
| `max_limit` | integer | 100 | Maximum items per page |

### Example

**Request:**
```
GET /api/v1/employees?page=2&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [/* 50 employees */],
  "meta": {
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_550e8400",
    "pagination": {
      "page": 2,
      "limit": 50,
      "total": 150,
      "total_pages": 3,
      "has_next": true,
      "has_previous": true
    }
  }
}
```

---

## Filtering and Sorting

### Filtering

Use query parameters for filtering:

```
GET /api/v1/employees?filter[department]=Engineering&filter[status]=active
```

**Supported Operators:**
- Equality: `filter[field]=value`
- Not equal: `filter[field][ne]=value`
- Greater than: `filter[field][gt]=value`
- Less than: `filter[field][lt]=value`
- Contains: `filter[field][contains]=value`
- In: `filter[field][in]=value1,value2`

### Sorting

Use `sort` parameter for sorting:

```
GET /api/v1/employees?sort=name&order=asc
```

**Parameters:**
- `sort`: Field to sort by
- `order`: `asc` or `desc` (default: `asc`)

**Multiple Fields:**
```
GET /api/v1/employees?sort=department,name&order=asc
```

### Example

**Request:**
```
GET /api/v1/employees?filter[department]=Engineering&filter[status][ne]=terminated&sort=hire_date&order=desc&page=1&limit=25
```

**Response:**
```json
{
  "success": true,
  "data": [/* filtered and sorted employees */],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 25,
      "total": 45,
      "total_pages": 2
    }
  }
}
```

---

## Best Practices

### Request IDs

Generate unique request IDs for debugging:

**Header:**
```
X-Request-ID: unique_request_id_here
```

### Caching

- Use ETag headers for conditional requests
- Respect `Cache-Control` headers
- Implement client-side caching where appropriate

### Retry Logic

For transient errors (5xx), implement exponential backoff:

1. Retry after 1 second
2. Retry after 2 seconds
3. Retry after 4 seconds
4. Fail after 3 attempts

### Timeouts

- Set reasonable request timeouts (30 seconds default)
- Use keep-alive connections
- Implement connection pooling

### Validation

- Validate all input on client side
- Server validation is authoritative
- Return clear validation error messages

### Idempotency

For POST/PUT operations that require idempotency, use:

**Header:**
```
Idempotency-Key: unique_key_here
```

The same request with the same idempotency key will return the same result without side effects.

---

## Authentication Endpoints Summary

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/login` | User login | No |
| POST | `/auth/logout` | User logout | Yes |
| POST | `/auth/refresh` | Refresh access token | No (refresh token) |
| POST | `/auth/forgot-password` | Request password reset | No |
| POST | `/auth/reset-password` | Reset password | No (token) |
| GET | `/auth/profile` | Get current user profile | Yes |
| PUT | `/auth/profile` | Update user profile | Yes |

---

## Next Steps

See specific module documentation:
- [Employee API](./employee-api.md)
- [Recruitment API](./recruitment-api.md)
- [Attendance & Leave API](./attendance-leave-api.md)
- [Payroll API](./payroll-api.md)
- [Performance API](./performance-api.md)
- [Training API](./training-api.md)
- [Self-Service API](./self-service-api.md)
- [Reports API](./reports-api.md)

