# Audit Logging Utility Usage Guide

## Overview

The audit utility tracks system activities by logging user actions, entity changes, IP addresses, and user agents for compliance and security auditing.

## Functions

### `addLog(userId, tenantId, action, entityType, entityId, changes, req)`

Creates an audit log entry. Returns audit log object on success, `null` on failure.

**Parameters:**

- `userId` (string, required): ID of the user performing the action
- `tenantId` (string, required): Tenant organization ID
- `action` (string, required): Action type - CREATE, UPDATE, DELETE, VIEW, OTHER
- `entityType` (string, required): Entity type (e.g., "User", "Department")
- `entityId` (string, required): ID of the entity
- `changes` (object, optional): Before/after changes object
- `req` (object, optional): Express request for IP/user agent extraction

### `getChangesDiff(oldData, newData)`

Compares two objects and returns only changed fields. Automatically filters sensitive fields (password, createdAt, updatedAt, deletedAt).

## Usage Examples

### UPDATE Operation

```javascript
import { addLog, getChangesDiff } from "../utils/audit.utils.js";

export const updateEmployee = async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { id: employeeId } = req.params;

    // Fetch state before update
    const oldEmployee = await prisma.user.findUnique({
      where: { id: employeeId, tenantId },
    });

    // Perform update
    const updatedEmployee = await prisma.user.update({
      where: { id: employeeId, tenantId },
      data: req.body,
    });

    // Calculate and log changes
    const changes = getChangesDiff(oldEmployee, updatedEmployee);
    await addLog(userId, tenantId, "UPDATE", "User", employeeId, changes, req);

    return res.status(200).json({
      success: true,
      data: updatedEmployee,
    });
  } catch (error) {
    // Error handling
  }
};
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "emp-123",
    "name": "John Smith",
    "phone": "+9876543210"
  }
}
```

**Audit Log:**

```json
{
  "id": "audit-550e8400-e29b-41d4-a716-446655440000",
  "userId": "user-123",
  "tenantId": "tenant-456",
  "timestamp": "2025-01-15T10:30:45.123Z",
  "action": "UPDATE",
  "entityType": "User",
  "entityId": "emp-123",
  "changes": {
    "name": {
      "before": "John Doe",
      "after": "John Smith"
    },
    "phone": {
      "before": "+1234567890",
      "after": "+9876543210"
    }
  },
  "ipAddress": "192.168.1.100",
  "userAgent": "Mozilla/5.0..."
}
```

### CREATE Operation

```javascript
export const createDepartment = async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;

    const newDepartment = await prisma.department.create({
      data: { ...req.body, tenantId },
    });

    const changes = {
      name: { before: null, after: newDepartment.name },
      code: { before: null, after: newDepartment.code },
    };

    await addLog(
      userId,
      tenantId,
      "CREATE",
      "Department",
      newDepartment.id,
      changes,
      req
    );

    return res.status(201).json({
      success: true,
      data: newDepartment,
    });
  } catch (error) {
    // Error handling
  }
};
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "dept-789",
    "name": "Human Resources",
    "code": "HR"
  }
}
```

### DELETE Operation

```javascript
export const deleteAllowanceType = async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { id: allowanceTypeId } = req.params;

    const allowanceType = await prisma.allowanceType.findUnique({
      where: { id: allowanceTypeId, tenantId },
    });

    await prisma.allowanceType.update({
      where: { id: allowanceTypeId },
      data: { deletedAt: new Date() },
    });

    const changes = {
      deletedAt: { before: null, after: new Date().toISOString() },
    };

    await addLog(
      userId,
      tenantId,
      "DELETE",
      "AllowanceType",
      allowanceTypeId,
      changes,
      req
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    // Error handling
  }
};
```

### VIEW Operation

```javascript
export const viewSalaryStructure = async (req, res) => {
  try {
    const { id: userId, tenantId } = req.user;
    const { id: salaryStructureId } = req.params;

    const salaryStructure = await prisma.salaryStructure.findUnique({
      where: { id: salaryStructureId, tenantId },
    });

    await addLog(
      userId,
      tenantId,
      "VIEW",
      "SalaryStructure",
      salaryStructureId,
      null,
      req
    );

    return res.status(200).json({
      success: true,
      data: salaryStructure,
    });
  } catch (error) {
    // Error handling
  }
};
```

## getChangesDiff Example

```javascript
const oldData = {
  name: "John Doe",
  phone: "+1234567890",
  password: "hashed_old", // Will be skipped
};

const newData = {
  name: "John Smith", // Changed
  phone: "+9876543210", // Changed
  password: "hashed_new", // Skipped
};

const changes = getChangesDiff(oldData, newData);
// Returns: { name: { before: "John Doe", after: "John Smith" }, phone: { ... } }
```

## Best Practices

1. **Non-blocking**: Audit logging failures return `null` and don't break main operations
2. **Capture before state**: Always fetch entity state before updates for accurate change tracking
3. **Consistent entity types**: Use consistent naming (e.g., "User" not "user" or "Employee")
4. **Optional req parameter**: Pass `null` for `req` in background jobs or non-HTTP contexts
5. **Error handling**: Function handles errors gracefully and logs them without throwing
