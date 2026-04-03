# Employee Warning API

This document defines the API contracts for the Employee Warning module.

- Base path: `/api/employees/:id/warnings`
- Auth: required (`requireAuth`)
- Tenant scope: mandatory on all queries and mutations
- Response envelope follows existing convention:
  - success: boolean
  - message: string
  - data: object | array
  - error: string (error responses)

See also: `backend/Datafin-HRMS-Docs/docs/employee-warning-flow.md`.

---

## 1) Roles and Access Rules

Roles in scope:
- `HR_ADMIN`
- `HR_STAFF`
- `DEPARTMENT_ADMIN`
- `STAFF`

Access policy:
- `HR_ADMIN`, `HR_STAFF`: full tenant access.
- `DEPARTMENT_ADMIN`: direct reports only.
- `STAFF`: self only for read, acknowledge, and appeal.

---

## 2) Endpoint Summary

| Method | Path | Purpose | Allowed Roles |
|---|---|---|---|
| GET | `/api/employees/warnings/dashboard` | Paginated warnings across the tenant for discipline UI; optional `?status=` filter (comma-separated) | HR_ADMIN, HR_STAFF (full tenant); DEPARTMENT_ADMIN (managed departments) |
| GET | `/api/employees/:id/warnings` | List warning records for employee | HR_ADMIN, HR_STAFF, DEPARTMENT_ADMIN (direct reports), STAFF (self) |
| POST | `/api/employees/:id/warnings` | Create warning draft | HR_ADMIN, HR_STAFF, DEPARTMENT_ADMIN (direct reports) |
| PATCH | `/api/employees/:id/warnings/:warningId` | Update draft or editable fields | HR_ADMIN, HR_STAFF, DEPARTMENT_ADMIN (own/direct report draft scope) |
| DELETE | `/api/employees/:id/warnings/:warningId` | Delete warning **draft** and remove attachment files | HR_ADMIN, HR_STAFF, DEPARTMENT_ADMIN (draft scope); status must be `DRAFT` |
| POST | `/api/employees/:id/warnings/:warningId/submit` | Move draft to HR review queue | HR_ADMIN, HR_STAFF, DEPARTMENT_ADMIN |
| POST | `/api/employees/:id/warnings/:warningId/return-to-draft` | HR sends case back from `PENDING_HR_REVIEW` to `DRAFT` | HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/issue` | Issue warning to employee | HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/resend-issued-notification` | Re-send issuance in-app + email notification | HR_ADMIN, HR_STAFF; status must be `ISSUED` |
| POST | `/api/employees/:id/warnings/:warningId/acknowledge` | Acknowledge issued warning | STAFF (self), HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/appeal` | Open appeal on issued warning | STAFF (self), HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/appeal/review` | Mark appeal under HR review | HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/appeal/decision` | Decide appeal (uphold/amend/void) | HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/resolve` | Mark warning resolved | HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/escalate` | Escalate severity/state | HR_ADMIN, HR_STAFF |
| POST | `/api/employees/:id/warnings/:warningId/void` | Void warning record | HR_ADMIN, HR_STAFF |

---

## 3) State Machine

Recommended lifecycle:

`DRAFT -> PENDING_HR_REVIEW -> ISSUED -> ACKNOWLEDGED -> (APPEAL_OPEN | RESOLVED | ESCALATED | VOIDED)`

Appeal branch:

`APPEAL_OPEN -> APPEAL_REVIEW -> (APPEAL_UPHELD | APPEAL_AMENDED | APPEAL_VOIDED)`

Transition notes:
- Only HR can `ISSUE`, `RESOLVE`, `ESCALATE`, `VOID`.
- `ACKNOWLEDGED` is valid only from `ISSUED`.
- Appeal transitions are HR-owned except opening appeal (`STAFF` self or HR on behalf).
- `VOIDED` is terminal.

---

## 4) Data Shape (Logical)

Example warning object:

```json
{
  "id": "wrn_123",
  "tenantId": "tenant_1",
  "userId": "emp_1",
  "title": "Repeated late arrival",
  "category": "ATTENDANCE",
  "severity": "LOW",
  "status": "DRAFT",
  "incidentDate": "2026-04-01",
  "reason": "Late clock-ins on 3 separate days",
  "policyReference": "Attendance Policy Section 2.1",
  "attachments": [],
  "issuedBy": null,
  "issuedAt": null,
  "acknowledgedBy": null,
  "acknowledgedAt": null,
  "resolvedBy": null,
  "resolvedAt": null,
  "resolutionNote": null,
  "createdAt": "2026-04-01T08:00:00.000Z",
  "updatedAt": "2026-04-01T08:00:00.000Z"
}
```

---

## 5) Detailed Endpoint Contracts

## 5.1 List Warnings

`GET /api/employees/:id/warnings`

Query params (optional):
- `status`: `DRAFT|PENDING_HR_REVIEW|ISSUED|ACKNOWLEDGED|APPEAL_OPEN|APPEAL_REVIEW|APPEAL_UPHELD|APPEAL_AMENDED|APPEAL_VOIDED|RESOLVED|ESCALATED|VOIDED`
- `severity`: `LOW|MEDIUM|HIGH|FINAL`
- `category`: string
- `page`: number (default 1)
- `limit`: number (default 20, max 100)

Success `200`:

```json
{
  "success": true,
  "message": "Warnings retrieved successfully",
  "data": [
    {
      "id": "wrn_123",
      "title": "Repeated late arrival",
      "severity": "LOW",
      "status": "ISSUED",
      "issuedAt": "2026-04-01T12:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Errors:
- `400` bad query params
- `403` forbidden
- `404` employee not found

---

## 5.2 Create Warning Draft

`POST /api/employees/:id/warnings`

Request body:

```json
{
  "title": "Repeated late arrival",
  "category": "ATTENDANCE",
  "severity": "LOW",
  "incidentDate": "2026-04-01",
  "reason": "Late clock-ins on 3 separate days",
  "policyReference": "Attendance Policy Section 2.1",
  "attachments": []
}
```

Validation:
- required: `title`, `category`, `severity`, `incidentDate`, `reason`
- `severity` in allowed enum
- `incidentDate` valid date

Success `201`:

```json
{
  "success": true,
  "message": "Warning draft created",
  "data": {
    "id": "wrn_123",
    "status": "DRAFT"
  }
}
```

Errors:
- `400` validation failure
- `403` forbidden
- `404` employee not found
- `409` conflict (optional duplicate protection)

---

## 5.3 Update Warning

`PATCH /api/employees/:id/warnings/:warningId`

Editable fields (recommended):
- `title`
- `category`
- `severity`
- `incidentDate`
- `reason`
- `policyReference`
- `attachments`

State restrictions (recommended):
- editable only in `DRAFT` and `PENDING_HR_REVIEW`
- HR can still add internal notes in later states if needed

Success `200`:

```json
{
  "success": true,
  "message": "Warning updated successfully",
  "data": {
    "id": "wrn_123",
    "status": "DRAFT"
  }
}
```

---

## 5.4 Submit for HR Review

`POST /api/employees/:id/warnings/:warningId/submit`

Request body:

```json
{
  "reviewNote": "Please validate evidence and issue if approved."
}
```

Transition:
- `DRAFT -> PENDING_HR_REVIEW`

Success `200`:

```json
{
  "success": true,
  "message": "Warning submitted for HR review",
  "data": {
    "id": "wrn_123",
    "status": "PENDING_HR_REVIEW"
  }
}
```

---

## 5.5 Issue Warning

`POST /api/employees/:id/warnings/:warningId/issue`

Request body:

```json
{
  "issueNote": "Formal warning issued after review.",
  "reviewDueDate": "2026-05-01"
}
```

Transition:
- `PENDING_HR_REVIEW -> ISSUED` (or `DRAFT -> ISSUED` for HR direct flow if policy permits)

Success `200`:

```json
{
  "success": true,
  "message": "Warning issued successfully",
  "data": {
    "id": "wrn_123",
    "status": "ISSUED",
    "issuedBy": "user_hr_1",
    "issuedAt": "2026-04-01T12:00:00.000Z"
  }
}
```

---

## 5.6 Acknowledge Warning

`POST /api/employees/:id/warnings/:warningId/acknowledge`

Request body:

```json
{
  "acknowledgementNote": "Received and understood."
}
```

Transition:
- `ISSUED -> ACKNOWLEDGED`

Success `200`:

```json
{
  "success": true,
  "message": "Warning acknowledged",
  "data": {
    "id": "wrn_123",
    "status": "ACKNOWLEDGED",
    "acknowledgedBy": "emp_1",
    "acknowledgedAt": "2026-04-02T08:30:00.000Z"
  }
}
```

---

## 5.7 Resolve Warning

`POST /api/employees/:id/warnings/:warningId/resolve`

Request body:

```json
{
  "resolutionNote": "Employee met corrective actions during review period."
}
```

Transitions:
- `ACKNOWLEDGED -> RESOLVED`
- optionally `ISSUED -> RESOLVED` if acknowledgement is not mandatory

Success `200`:

```json
{
  "success": true,
  "message": "Warning resolved",
  "data": {
    "id": "wrn_123",
    "status": "RESOLVED",
    "resolvedBy": "user_hr_1",
    "resolvedAt": "2026-05-01T10:00:00.000Z"
  }
}
```

---

## 5.8 Open Appeal

`POST /api/employees/:id/warnings/:warningId/appeal`

Request body:

```json
{
  "appealReason": "Clock-in evidence was not considered.",
  "employeeStatement": "I was on approved client travel and informed my manager.",
  "attachments": []
}
```

Transition:
- `ISSUED|ACKNOWLEDGED -> APPEAL_OPEN`

Success `200`:

```json
{
  "success": true,
  "message": "Appeal submitted successfully",
  "data": {
    "id": "wrn_123",
    "status": "APPEAL_OPEN",
    "appealOpenedAt": "2026-04-03T11:15:00.000Z"
  }
}
```

---

## 5.9 Appeal Review

`POST /api/employees/:id/warnings/:warningId/appeal/review`

Request body:

```json
{
  "reviewNote": "Appeal evidence is being verified."
}
```

Transition:
- `APPEAL_OPEN -> APPEAL_REVIEW`

Success `200`:

```json
{
  "success": true,
  "message": "Appeal moved to review",
  "data": {
    "id": "wrn_123",
    "status": "APPEAL_REVIEW"
  }
}
```

---

## 5.10 Appeal Decision

`POST /api/employees/:id/warnings/:warningId/appeal/decision`

Request body:

```json
{
  "decision": "AMEND",
  "decisionNote": "Severity reduced due to corroborating records.",
  "updatedSeverity": "LOW"
}
```

Decision outcomes:
- `UPHOLD` -> `APPEAL_UPHELD`
- `AMEND` -> `APPEAL_AMENDED`
- `VOID` -> `APPEAL_VOIDED`

Success `200`:

```json
{
  "success": true,
  "message": "Appeal decision recorded",
  "data": {
    "id": "wrn_123",
    "status": "APPEAL_AMENDED",
    "severity": "LOW",
    "appealDecidedAt": "2026-04-05T09:00:00.000Z"
  }
}
```

---

## 5.11 Escalate Warning

`POST /api/employees/:id/warnings/:warningId/escalate`

Request body:

```json
{
  "newSeverity": "HIGH",
  "escalationNote": "Repeat attendance breach during monitoring period."
}
```

Transition:
- `ISSUED|ACKNOWLEDGED -> ESCALATED`

Success `200`:

```json
{
  "success": true,
  "message": "Warning escalated",
  "data": {
    "id": "wrn_123",
    "status": "ESCALATED",
    "severity": "HIGH"
  }
}
```

---

## 5.12 Void Warning

`POST /api/employees/:id/warnings/:warningId/void`

Request body:

```json
{
  "voidReason": "Evidence invalidated after review."
}
```

Transition:
- any non-terminal state -> `VOIDED`

Success `200`:

```json
{
  "success": true,
  "message": "Warning voided",
  "data": {
    "id": "wrn_123",
    "status": "VOIDED"
  }
}
```

---

## 6) Status Code Matrix

| Code | Meaning | Typical Cases |
|---|---|---|
| 200 | OK | successful reads/transitions |
| 201 | Created | new warning draft created |
| 400 | Bad Request | validation errors, invalid transition |
| 401 | Unauthorized | unauthenticated |
| 403 | Forbidden | role or scope mismatch |
| 404 | Not Found | employee or warning missing |
| 409 | Conflict | duplicate or conflicting state |
| 500 | Internal Server Error | unexpected server error |

---

## 7) Error Response Contract

```json
{
  "success": false,
  "error": "Forbidden",
  "message": "You do not have permission to issue warnings"
}
```

---

## 8) Audit and Activity Requirements

For each mutation, create audit entries (existing pattern):
- entityType: `EmployeeWarning`
- entityId: warning id
- action:
  - `CREATE` for draft creation
  - `UPDATE` for field edits
  - `OTHER` for state transitions (`submit`, `issue`, `acknowledge`, `appeal_open`, `appeal_review`, `appeal_decision`, `resolve`, `escalate`, `void`)
- changes payload should include:
  - state before/after
  - severity changes where applicable
  - actor and timestamp metadata

Optional feed integration:
- publish warning events into employee combined feed with `feedVariant: "warning"`.

---

## 9) Pagination and Sorting Conventions

Recommended defaults:
- sort by `createdAt desc` (or `issuedAt desc` where relevant)
- default `limit = 20`
- max `limit = 100`
- include pagination metadata for list endpoints

---

## 10) Implementation Notes (Codebase Alignment)

- Keep controller patterns consistent with `employee.controller.js`:
  - role checks,
  - tenant scoping,
  - structured error responses,
  - logger usage.
- Add endpoints in employee routes or dedicated warning route mounted under employee namespace.
- Reuse `addLog(...)` for audit events.
- Enforce direct-report checks for `DEPARTMENT_ADMIN` before allowing create/update/submit.

