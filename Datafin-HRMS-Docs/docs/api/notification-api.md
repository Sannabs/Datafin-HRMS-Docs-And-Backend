# Notification API Documentation

## Base Endpoint

```
/api/notifications
```

---

## Overview

The Notification API provides endpoints for managing user notifications within the HRMS system. All endpoints require authentication and users can only access their own notifications.

### Notification Types

The following notification types are supported:

- `PAYROLL` - Payroll-related notifications
- `ATTENDANCE` - Attendance and time tracking notifications
- `LEAVE` - Leave request and approval notifications
- `PERFORMANCE` - Performance review and appraisal notifications
- `ACTIVITIES` - General activity notifications
- `OTHER` - Other miscellaneous notifications

---

## Get User Notifications

Retrieve paginated list of notifications for the authenticated user.

**GET** `/api/notifications`

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `page` | integer | No | Page number (default: 1) |
| `limit` | integer | No | Items per page (default: 10, max: 100) |
| `readStatus` | boolean | No | Filter by read status (`true` or `false`) |
| `type` | string | No | Filter by notification type (see Notification Types above) |

**Response:** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "tenantId": "tenant_550e8400",
      "userId": "user_550e8400",
      "title": "Payroll Processing Complete",
      "message": "Your payroll for January 2025 has been processed successfully.",
      "type": "PAYROLL",
      "readStatus": false,
      "actionUrl": "/payslips/january-2025",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

**Example Requests:**

Get all notifications:

```bash
GET /api/notifications
```

Get unread notifications only:

```bash
GET /api/notifications?readStatus=false
```

Get payroll notifications:

```bash
GET /api/notifications?type=PAYROLL
```

Get unread payroll notifications with pagination:

```bash
GET /api/notifications?type=PAYROLL&readStatus=false&page=1&limit=20
```

---

## Get Unread Notification Count

Get the count of unread notifications for the authenticated user.

**GET** `/api/notifications/unread-count`

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

---

## Mark Notification as Read

Mark a specific notification as read.

**PATCH** `/api/notifications/{id}/read`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | Notification ID |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Notification marked as read",
  "data": {
    "id": 1,
    "tenantId": "tenant_550e8400",
    "userId": "user_550e8400",
    "title": "Payroll Processing Complete",
    "message": "Your payroll for January 2025 has been processed successfully.",
    "type": "PAYROLL",
    "readStatus": true,
    "actionUrl": "/payslips/january-2025",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

Notification not found:

```json
{
  "success": false,
  "message": "Notification not found"
}
```

Status: `404 Not Found`

Invalid notification ID:

```json
{
  "success": false,
  "message": "Invalid notification ID"
}
```

Status: `400 Bad Request`

---

## Mark All Notifications as Read

Mark all unread notifications as read for the authenticated user.

**PATCH** `/api/notifications/read-all`

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Marked 5 notifications as read",
  "data": {
    "count": 5
  }
}
```

---

## Delete Notification

Delete a specific notification.

**DELETE** `/api/notifications/{id}`

**Path Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | integer | Yes | Notification ID |

**Response:** `200 OK`

```json
{
  "success": true,
  "message": "Notification deleted successfully",
  "data": {
    "id": 1,
    "tenantId": "tenant_550e8400",
    "userId": "user_550e8400",
    "title": "Payroll Processing Complete",
    "message": "Your payroll for January 2025 has been processed successfully.",
    "type": "PAYROLL",
    "readStatus": true,
    "actionUrl": "/payslips/january-2025",
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T11:00:00.000Z"
  }
}
```

**Error Responses:**

Notification not found:

```json
{
  "success": false,
  "message": "Notification not found"
}
```

Status: `404 Not Found`

Invalid notification ID:

```json
{
  "success": false,
  "message": "Invalid notification ID"
}
```

Status: `400 Bad Request`

---

## Notification Data Model

### Notification Object

```json
{
  "id": 1,
  "tenantId": "string",
  "userId": "string",
  "title": "string",
  "message": "string",
  "type": "PAYROLL | ATTENDANCE | LEAVE | PERFORMANCE | ACTIVITIES | OTHER",
  "readStatus": false,
  "actionUrl": "string | null",
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z"
}
```

### Field Descriptions

| Field        | Type           | Description                                              |
| ------------ | -------------- | -------------------------------------------------------- |
| `id`         | integer        | Unique notification identifier (auto-increment)          |
| `tenantId`   | string         | Tenant/organization ID                                   |
| `userId`     | string         | User ID of the notification recipient                    |
| `title`      | string         | Notification title (required, cannot be empty)           |
| `message`    | string         | Notification message/content (required, cannot be empty) |
| `type`       | enum           | Notification type (see Notification Types above)         |
| `readStatus` | boolean        | Whether the notification has been read (default: false)  |
| `actionUrl`  | string \| null | Optional URL for the user to navigate to related content |
| `createdAt`  | datetime       | Timestamp when notification was created                  |
| `updatedAt`  | datetime       | Timestamp when notification was last updated             |

---

## Authentication & Authorization

All notification endpoints require authentication via Bearer token. Users can only access their own notifications - attempting to access another user's notifications will result in a 404 Not Found error.

**Authentication Header:**

```
Authorization: Bearer <token>
```

---

## Error Handling

The Notification API follows standard error response format:

```json
{
  "success": false,
  "message": "Error message description"
}
```

### Common Error Codes

| Status Code | Description                                                        |
| ----------- | ------------------------------------------------------------------ |
| 400         | Bad Request - Invalid parameters or notification ID                |
| 401         | Unauthorized - Missing or invalid authentication token             |
| 404         | Not Found - Notification does not exist or does not belong to user |
| 500         | Internal Server Error - Server-side error                          |

---

## Service Functions

The notification system also provides service functions for internal use:

### Create Notification

`createNotification(tenantId, userId, title, message, type, actionUrl)`

Creates a single notification for a user. Used internally by other modules.

### Notify All Admins

`notifyAllAdmins(title, tenantId, message, type, actionUrl)`

Creates notifications for all HR_ADMIN users in a tenant. Returns count of successful and failed notifications.

### Notify All HR Staff

`notifyAllHRstaff(title, tenantId, message, type, actionUrl)`

Creates notifications for all HR_STAFF users in a tenant. Returns count of successful and failed notifications.

---

## Best Practices

1. **Polling Frequency**: For unread count, consider polling at reasonable intervals (e.g., every 30-60 seconds) rather than constantly.

2. **Pagination**: Always use pagination when fetching notifications to avoid loading too much data at once.

3. **Filtering**: Use type and readStatus filters to help users find specific notifications quickly.

4. **Action URLs**: When creating notifications, provide meaningful action URLs that direct users to the relevant content.

5. **Notification Cleanup**: Consider implementing automatic cleanup of old notifications to maintain database performance.
