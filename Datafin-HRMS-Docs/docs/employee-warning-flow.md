# Employee Warning Flow

This document defines:

1. Enterprise HR warning lifecycle (platform-agnostic).
2. Datafin-specific flow map based on current roles:
   - `HR_ADMIN`
   - `HR_STAFF`
   - `DEPARTMENT_ADMIN`
   - `STAFF`
3. API contract sequence aligned to existing backend conventions in this codebase.

---

## 1) Enterprise Warning Lifecycle (Reference Model)

### A. Trigger and Case Intake
- A policy or behavior event is reported (attendance misconduct, code of conduct breach, performance issue, compliance breach).
- Reporter creates a case with incident date/time, summary, and evidence.
- Case starts in non-employee-visible state (`DRAFT` or `UNDER_REVIEW`).

### B. Validation and Classification
- HR validates incident facts, policy references, and historical context.
- Case is classified by:
  - category (attendance, conduct, performance, compliance, safety),
  - severity (`LOW`, `MEDIUM`, `HIGH`, `FINAL`),
  - potential legal/operational risk.

### C. Approval Gate
- Typical enterprise approval chain:
  - line manager or HR initiates,
  - HR verifies,
  - legal/compliance approves high/final warnings where required by policy.
- Only approved items can be issued to employee.

### D. Issuance
- Warning is issued with:
  - clear reason and violated policy references,
  - expected corrective action,
  - review period and timeline,
  - stated consequence for recurrence.
- Employee receives in-app and/or email notification.

### E. Employee Acknowledgement
- Employee acknowledges receipt (not admission of guilt).
- If employee refuses acknowledgement, HR records refusal event with note.

### F. Corrective Monitoring
- Optional CAP/PIP linked to warning:
  - action items,
  - due dates,
  - owner and reviewer.
- Progress checkpoints tracked through the monitoring window.

### G. Appeal and Grievance
- Employee can submit an appeal within a policy-defined window after warning issuance.
- Appeal captures employee statement, supporting evidence, and requested remedy.
- HR reviews appeal (and can involve legal/compliance for high-risk cases).
- Appeal outcomes:
  - uphold warning,
  - amend warning (severity/details),
  - void warning.
- Appeal decision is communicated to employee and logged with reviewer metadata.

### H. Closure
- At review date, case resolves to one of:
  - `RESOLVED`,
  - `ESCALATED`,
  - `VOIDED`,
  - or extended monitoring.

### I. Retention and Audit
- Warning history is immutable in audit logs.
- Visibility is role-based and tenant-scoped.
- Retention follows local labor law and company policy.

---

## 2) Datafin-Specific Role-Mapped Flow

This map is tailored to current platform role model.

### Role Responsibility Matrix

| Flow Step | HR_ADMIN | HR_STAFF | DEPARTMENT_ADMIN | STAFF |
|---|---|---|---|---|
| Create draft warning | Yes | Yes | Yes (direct reports only) | No |
| Edit draft details | Yes | Yes | Yes (own drafts, direct reports only) | No |
| Submit for HR approval | Yes | Yes | Yes | No |
| Approve warning for issuance | Yes | Yes | No | No |
| Issue warning to employee | Yes | Yes | No | No |
| View team warning list | Yes | Yes | Yes (direct reports only) | No |
| View own warning records | Yes | Yes | Yes | Yes (self only) |
| Acknowledge warning | Yes (on behalf, if needed) | Yes (on behalf, if needed) | No | Yes (self only) |
| Open appeal | Yes (on behalf, if needed) | Yes (on behalf, if needed) | No | Yes (self only) |
| Review appeal | Yes | Yes | No | No |
| Decide appeal (uphold/amend/void) | Yes | Yes | No | No |
| Resolve / Void warning | Yes | Yes | No | No |
| Escalate severity | Yes | Yes | No | No |

### Datafin Flow States

Recommended minimum state machine:

`DRAFT -> PENDING_HR_REVIEW -> ISSUED -> ACKNOWLEDGED -> (APPEAL_OPEN | RESOLVED | ESCALATED | VOIDED)`

Appeal branch:

`APPEAL_OPEN -> APPEAL_REVIEW -> (APPEAL_UPHELD | APPEAL_AMENDED | APPEAL_VOIDED)`

Notes:
- `DEPARTMENT_ADMIN` can initiate, but cannot issue without HR review.
- `STAFF` can only read own issued records and acknowledge own records.
- All transitions must enforce tenant scoping (`tenantId`) and role checks.

### Datafin Escalation Rules (Recommended)

- 3 active warnings in rolling 12 months -> system flags employee for HR escalation review.
- Any `FINAL` warning auto-creates a mandatory follow-up checkpoint.
- Repeated same-category incidents during monitoring -> suggest escalation action.

### Datafin Notification Targets

- On submit for review: notify `HR_ADMIN` + `HR_STAFF`.
- On issue: notify target `STAFF` employee.
- On acknowledgement: notify issuing HR actor and optional reporting manager.
- On escalation/resolution/void: notify HR team and direct manager (if present).

---

## 3) API Contract Sequence (Datafin)

The sequence below follows existing API style:
- `success`, `error`, `message`, `data`,
- tenant-aware authorization,
- role checks via middleware + controller guards,
- audit logging using `addLog(...)`.

### 3.1 Endpoint Set

Base namespace (recommended):

- `GET /api/employees/:id/warnings`
- `POST /api/employees/:id/warnings`
- `PATCH /api/employees/:id/warnings/:warningId`
- `POST /api/employees/:id/warnings/:warningId/submit`
- `POST /api/employees/:id/warnings/:warningId/issue`
- `POST /api/employees/:id/warnings/:warningId/acknowledge`
- `POST /api/employees/:id/warnings/:warningId/appeal`
- `POST /api/employees/:id/warnings/:warningId/appeal/review`
- `POST /api/employees/:id/warnings/:warningId/appeal/decision`
- `POST /api/employees/:id/warnings/:warningId/resolve`
- `POST /api/employees/:id/warnings/:warningId/escalate`
- `POST /api/employees/:id/warnings/:warningId/void`

### 3.2 Contract Shapes

#### Create warning (draft)
`POST /api/employees/:id/warnings`

Request:

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

Response:

```json
{
  "success": true,
  "message": "Warning draft created",
  "data": {
    "id": "wrn_123",
    "userId": "emp_1",
    "status": "DRAFT",
    "severity": "LOW",
    "issuedAt": null
  }
}
```

#### Submit for HR review
`POST /api/employees/:id/warnings/:warningId/submit`

Request:

```json
{
  "reviewNote": "Please validate evidence and issue if approved."
}
```

Response:

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

#### Issue warning
`POST /api/employees/:id/warnings/:warningId/issue`

Request:

```json
{
  "issueNote": "Formal warning issued after review.",
  "reviewDueDate": "2026-05-01"
}
```

Response:

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

#### Employee acknowledge
`POST /api/employees/:id/warnings/:warningId/acknowledge`

Request:

```json
{
  "acknowledgementNote": "Received and understood."
}
```

#### Open appeal
`POST /api/employees/:id/warnings/:warningId/appeal`

Request:

```json
{
  "appealReason": "Clock-in evidence was not considered.",
  "employeeStatement": "I was on approved client travel and informed my manager.",
  "attachments": []
}
```

Response:

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

#### Appeal decision
`POST /api/employees/:id/warnings/:warningId/appeal/decision`

Request:

```json
{
  "decision": "AMEND",
  "decisionNote": "Severity reduced due to corroborating records.",
  "updatedSeverity": "LOW"
}
```

Response:

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

Response:

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

#### Resolve warning
`POST /api/employees/:id/warnings/:warningId/resolve`

Request:

```json
{
  "resolutionNote": "Employee met corrective actions during review period."
}
```

Response:

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

### 3.3 Expected Authorization Rules Per Endpoint

- `GET /employees/:id/warnings`
  - `HR_ADMIN`, `HR_STAFF`: any employee in tenant.
  - `DEPARTMENT_ADMIN`: direct reports only.
  - `STAFF`: self only.

- `POST /employees/:id/warnings` (create draft)
  - `HR_ADMIN`, `HR_STAFF`: allowed.
  - `DEPARTMENT_ADMIN`: allowed for direct reports only.
  - `STAFF`: denied.

- `POST /submit`
  - same as create.

- `POST /issue`, `/resolve`, `/escalate`, `/void`
  - `HR_ADMIN`, `HR_STAFF` only.

- `POST /acknowledge`
  - self employee, or HR actor acting on behalf (with note).

- `POST /appeal`
  - self employee, or HR actor opening on behalf (with note).

- `POST /appeal/review`, `POST /appeal/decision`
  - `HR_ADMIN`, `HR_STAFF` only.

### 3.4 Suggested Audit Events

Persist audit events (via existing audit utility):

- `CREATE` warning draft
- `UPDATE` warning fields
- `OTHER` submit / issue / acknowledge / appeal_open / appeal_review / appeal_decision / resolve / escalate / void transitions
- entityType: `EmployeeWarning`
- entityId: warning record id

### 3.5 Suggested Error Response Pattern

Follow existing error shape:

```json
{
  "success": false,
  "error": "Forbidden",
  "message": "You do not have permission to issue warnings"
}
```

---

## 4) Frontend Sequence (Employee Detail Page)

Recommended UI order on employee detail:

1. Warning list (active first, then history).
2. Action buttons by role and record state.
3. Filters: `status`, `severity`, `category`.
4. Employee feed row for warning events (`feedVariant: warning`).

Primary actions by role:
- `HR_ADMIN`, `HR_STAFF`: Create, Issue, Resolve, Escalate, Void.
- `DEPARTMENT_ADMIN`: Create draft, Submit for review.
- `STAFF`: View own, Acknowledge own.

---

## 5) MVP Scope Recommendation

For first release:

1. Implement states: `DRAFT`, `PENDING_HR_REVIEW`, `ISSUED`, `ACKNOWLEDGED`, `APPEAL_OPEN`, `APPEAL_REVIEW`, `APPEAL_UPHELD`, `APPEAL_AMENDED`, `APPEAL_VOIDED`, `RESOLVED`, `VOIDED`.
2. Implement endpoints: list/create/submit/issue/acknowledge/appeal/appeal-review/appeal-decision/resolve/void.
3. Add audit logs for every transition.
4. Add role/tenant enforcement exactly as mapped above.
5. Add employee detail warning panel and optional feed integration.

