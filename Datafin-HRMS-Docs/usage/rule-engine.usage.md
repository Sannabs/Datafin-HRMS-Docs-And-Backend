# Rule Engine Usage Guide

## Overview

The rule engine is built on `json-rules-engine`, providing powerful rule evaluation with caching, multiple operators, and flexible condition trees for calculating conditional allowances and deductions.

## Features

- **17 operators** for flexible rule conditions
- **Rule caching** (5-minute TTL per tenant)
- **Automatic cache invalidation** when rules are modified
- **Nested condition trees** (AND/OR)
- **Priority-based rule matching**

## Available Operators

### Comparison Operators

| Operator             | Description                              | Example                                                                                      |
| -------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `equals`             | Exact match (case-sensitive for strings) | `{ "field": "status", "operator": "equals", "value": "ACTIVE" }`                             |
| `notEquals`          | Not equal to value                       | `{ "field": "status", "operator": "notEquals", "value": "TERMINATED" }`                      |
| `greaterThan`        | Greater than (numeric)                   | `{ "field": "baseSalary", "operator": "greaterThan", "value": 50000 }`                       |
| `lessThan`           | Less than (numeric)                      | `{ "field": "baseSalary", "operator": "lessThan", "value": 100000 }`                         |
| `greaterThanOrEqual` | Greater than or equal                    | `{ "field": "yearsOfService", "operator": "greaterThanOrEqual", "value": 5 }`                |
| `lessThanOrEqual`    | Less than or equal                       | `{ "field": "yearsOfService", "operator": "lessThanOrEqual", "value": 10 }`                  |
| `between`            | Between min and max (inclusive)          | `{ "field": "baseSalary", "operator": "between", "value": { "min": 50000, "max": 100000 } }` |
| `notBetween`         | Not between min and max                  | `{ "field": "baseSalary", "operator": "notBetween", "value": { "min": 0, "max": 30000 } }`   |

### Array Operators

| Operator        | Description                        | Example                                                                                                        |
| --------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `in`            | Value is in the provided array     | `{ "field": "departmentId", "operator": "in", "value": ["dept-1", "dept-2"] }`                                 |
| `notIn`         | Value is not in the provided array | `{ "field": "employmentType", "operator": "notIn", "value": ["CONTRACT", "INTERN"] }`                          |
| `arrayContains` | Array fact contains the value      | `{ "field": "skills", "operator": "arrayContains", "value": "JavaScript" }`                                    |
| `arrayLength`   | Array length comparison            | `{ "field": "certifications", "operator": "arrayLength", "value": { "operator": "greaterThan", "value": 2 } }` |

### String Operators

| Operator     | Description                                  | Example                                                                   |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------- |
| `contains`   | String contains substring (case-insensitive) | `{ "field": "jobTitle", "operator": "contains", "value": "manager" }`     |
| `startsWith` | String starts with value (case-insensitive)  | `{ "field": "employeeCode", "operator": "startsWith", "value": "EMP" }`   |
| `endsWith`   | String ends with value (case-insensitive)    | `{ "field": "email", "operator": "endsWith", "value": "@company.com" }`   |
| `matches`    | String matches regex pattern                 | `{ "field": "phone", "operator": "matches", "value": "^\\+1[0-9]{10}$" }` |
| `isEmpty`    | Value is empty (string, array, or object)    | `{ "field": "notes", "operator": "isEmpty", "value": true }`              |

### Date Operators

| Operator     | Description                       | Example                                                                     |
| ------------ | --------------------------------- | --------------------------------------------------------------------------- |
| `dateBefore` | Date is before the specified date | `{ "field": "hireDate", "operator": "dateBefore", "value": "2020-01-01" }`  |
| `dateAfter`  | Date is after the specified date  | `{ "field": "hireDate", "operator": "dateAfter", "value": "2015-01-01" }`   |
| `dateEquals` | Date is the same day as specified | `{ "field": "startDate", "operator": "dateEquals", "value": "2024-01-15" }` |

## Rule Structure

### Single Condition

```json
{
  "conditions": {
    "field": "departmentId",
    "operator": "equals",
    "value": "dept-sales"
  },
  "action": {
    "type": "FIXED",
    "value": 500
  }
}
```

### Multiple Conditions (AND)

```json
{
  "conditions": {
    "operator": "AND",
    "conditions": [
      { "field": "departmentId", "operator": "equals", "value": "dept-sales" },
      { "field": "baseSalary", "operator": "greaterThan", "value": 50000 }
    ]
  },
  "action": {
    "type": "PERCENTAGE",
    "value": 10,
    "base": "baseSalary"
  }
}
```

### Multiple Conditions (OR)

```json
{
  "conditions": {
    "operator": "OR",
    "conditions": [
      { "field": "departmentId", "operator": "equals", "value": "dept-sales" },
      { "field": "departmentId", "operator": "equals", "value": "dept-marketing" }
    ]
  },
  "action": {
    "type": "FIXED",
    "value": 300
  }
}
```

### Nested Conditions

```json
{
  "conditions": {
    "operator": "AND",
    "conditions": [
      {
        "operator": "OR",
        "conditions": [
          { "field": "departmentId", "operator": "equals", "value": "dept-sales" },
          { "field": "departmentId", "operator": "equals", "value": "dept-marketing" }
        ]
      },
      { "field": "yearsOfService", "operator": "greaterThanOrEqual", "value": 2 }
    ]
  },
  "action": {
    "type": "PERCENTAGE",
    "value": 5,
    "base": "grossSalary"
  }
}
```

## Action Types

### FIXED

Returns a fixed amount.

```json
{
  "type": "FIXED",
  "value": 1000
}
```

### PERCENTAGE

Calculates a percentage of base salary or gross salary.

```json
{
  "type": "PERCENTAGE",
  "value": 10,
  "base": "baseSalary"  // or "grossSalary"
}
```

### FORMULA (Coming Soon)

Will support mathematical formulas with variables (Phase 4).

```json
{
  "type": "FORMULA",
  "value": "(baseSalary * 0.1) + 500"
}
```

## Employee Context Fields

The following fields are available in the employee context for rule evaluation:

| Field            | Type   | Description                            |
| ---------------- | ------ | -------------------------------------- |
| `departmentId`   | string | Employee's department ID               |
| `positionId`     | string | Employee's position ID                 |
| `employmentType` | string | FULL_TIME, PART_TIME, CONTRACT, INTERN |
| `baseSalary`     | number | Employee's base salary                 |
| `status`         | string | ACTIVE, ON_LEAVE, TERMINATED, etc.     |
| `hireDate`       | date   | Employee's hire date                   |
| `yearsOfService` | number | Years since hire date                  |

Additional custom fields may be available depending on your implementation.

## API Endpoints

### Get Available Operators

```http
GET /api/calculation-rules/operators
Authorization: Bearer <token>
```

Returns list of all available operators with descriptions.

### Get Cache Statistics

```http
GET /api/calculation-rules/cache-stats
Authorization: Bearer <token>
```

Returns cache statistics (admin only).

### Validate Conditions

```http
POST /api/calculation-rules/validate-conditions
Authorization: Bearer <token>
Content-Type: application/json

{
  "conditions": {
    "operator": "AND",
    "conditions": [
      { "field": "departmentId", "operator": "equals", "value": "dept-1" }
    ]
  }
}
```

Returns validation results.

### Test Rule

```http
POST /api/calculation-rules/:id/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "employeeContext": {
    "departmentId": "dept-sales",
    "baseSalary": 60000,
    "yearsOfService": 3
  },
  "baseSalary": 60000,
  "grossSalary": 70000
}
```

## Performance Benefits

### Rule Caching

- Rules are cached per tenant and rule type
- Cache TTL: 5 minutes
- Cache is automatically invalidated on rule changes
- Reduces database queries for repeated calculations

### Optimized Evaluation

- Rules are compiled once and reused
- Multiple employees can be evaluated against the same cached rules
- Ideal for batch payroll processing

## Troubleshooting

### Cache Not Working

1. Check cache stats: `GET /api/calculation-rules/cache-stats`
2. Cache may have expired (5-minute TTL)
3. Ensure rules are being created/updated through the API (triggers cache invalidation)

### Rule Not Matching

1. Validate conditions: `POST /api/calculation-rules/validate-conditions`
2. Check employee context has required fields
3. Verify rule is active and within effective dates
4. Test with `/test` endpoint to debug

### Performance Issues

1. Check number of rules per type (more rules = more evaluation time)
2. Consider consolidating similar rules
3. Use higher priority for commonly matched rules

