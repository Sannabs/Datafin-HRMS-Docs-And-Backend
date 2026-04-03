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

- `GET /api/employees/warnings/dashboard` — tenant- or dept-scoped list for discipline UI (`page`, `limit`, optional `status`)
- `GET /api/employees/:id/warnings`
- `POST /api/employees/:id/warnings`
- `PATCH /api/employees/:id/warnings/:warningId`
- `DELETE /api/employees/:id/warnings/:warningId` — abandon draft (`DRAFT` only)
- `POST /api/employees/:id/warnings/:warningId/submit`
- `POST /api/employees/:id/warnings/:warningId/return-to-draft` — HR: `PENDING_HR_REVIEW` → `DRAFT`
- `POST /api/employees/:id/warnings/:warningId/issue`
- `POST /api/employees/:id/warnings/:warningId/resend-issued-notification` — `ISSUED` only
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

- `GET /employees/warnings/dashboard`
  - `HR_ADMIN`, `HR_STAFF`: all warnings in tenant.
  - `DEPARTMENT_ADMIN`: warnings for employees in departments they manage.
  - `STAFF`: denied.

- `GET /employees/:id/warnings`
  - `HR_ADMIN`, `HR_STAFF`: any employee in tenant.
  - `DEPARTMENT_ADMIN`: direct reports only.
  - `STAFF`: self only.

- `POST /employees/:id/warnings` (create draft)
  - `HR_ADMIN`, `HR_STAFF`: allowed.
  - `DEPARTMENT_ADMIN`: allowed for direct reports only.
  - `STAFF`: denied.

- `DELETE /employees/:id/warnings/:warningId` (delete draft)
  - Same scope as draft edit: `HR_ADMIN`, `HR_STAFF`, or `DEPARTMENT_ADMIN` for scoped drafts they may edit; `DRAFT` only.

- `POST /submit`
  - same as create.

- `POST /return-to-draft`
  - `HR_ADMIN`, `HR_STAFF` only; from `PENDING_HR_REVIEW` to `DRAFT`.

- `POST /resend-issued-notification`
  - `HR_ADMIN`, `HR_STAFF` only; `ISSUED` only.

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

### 3.6 Immutability and mutability (backend contract)

This is the enforcement matrix implemented in the API (see `PATCH` vs workflow `POST`s).

| Field group | Editable how / when |
|-------------|---------------------|
| **Core case facts** (`title`, `category`, `severity`, `incidentDate`, `reason`, `policyReference`, `attachments`) | Only while status is **`DRAFT`**, via `PATCH .../warnings/:warningId`. Not editable after submit or issue. |
| **`reviewNote`** | Set or updated on **`POST .../submit`** (from `DRAFT`). |
| **Issue metadata** (`issueNote`, `reviewDueDate`, `issuedAt`, `issuedById`, `finalFollowUpDueAt` for `FINAL`) | Set on **`POST .../issue`** only. |
| **Acknowledgement** | `acknowledgementNote`, `acknowledgedAt`, `acknowledgedById` on **`POST .../acknowledge`**; refusal timestamps/note on **`POST .../refuse-acknowledgement`**. |
| **Appeal** | Appeal fields on **`POST .../appeal`**; review metadata on **`POST .../appeal/review`**; outcome, `appealDecisionNote`, and severity (if `AMEND`) on **`POST .../appeal/decision`**. |
| **Resolve / void / escalate** | `resolutionNote`, `voidNote`, `escalationNote` and terminal metadata only on their respective **`POST`** endpoints. |

**Severity after issue:** may change only through an appeal decision of type **`AMEND`** (not via `PATCH`).

**Audit:** `AuditLog` rows are append-only; correcting mistakes after issue is done via **void**, **appeal/amend**, or a new draft/warning per policy—not by rewriting history without a logged transition.

### 3.7 Retention and export

- **Retention:** No automatic purge or anonymization is defined in the product layer; align storage duration with tenant legal/policy (jurisdiction and company rules). Archival or deletion jobs are a future platform concern unless required earlier.
- **Export:** No dedicated “warnings export” endpoint ships by default. If audit or labor-law requires bulk export, add an HR-gated report or export feature with explicit scope (tenant, date range, PII handling).

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

## 5) Full Implementation — Sprint Breakdown

Below is an end-to-end plan aligned to Sections 1–4: data model, all workflow states, full endpoint set, authorization, audit, notifications, escalation rules, and employee-detail UI. Sprint lengths assume a typical two-week cadence; adjust grouping if your team capacity differs.

### Sprint 1 — Domain model, tenancy, and read APIs

**Goal:** Persist warnings and expose a role-safe list/detail view.

- Schema and persistence for warnings (title, category, severity, incident date, reason, policy reference, attachments metadata, status, timestamps, issued/resolved metadata, tenant + user linkage).
- Enums aligned to this doc: categories, severity (`LOW` through `FINAL`), and all statuses in the state machines in Section 2.
- `GET /api/employees/:id/warnings` with tenant scoping and the visibility rules in Section 3.3 (HR vs department admin direct reports vs self-only).
- Basic validation and consistent error shape (Section 3.5).
- Audit: log `CREATE` once drafts can be created (Sprint 2) — or stub audit integration here if creation lands same sprint.

**Exit criteria:** HR and department admins can list warnings they are allowed to see; employees can list only their own when records exist.

### Sprint 2 — Draft lifecycle: create, edit, submit, HR issue

**Goal:** Complete the path from intake to formal issuance.

- `POST /api/employees/:id/warnings` (draft) and `PATCH .../warnings/:warningId` with role rules from the matrix (who can create/edit; department admin direct reports only).
- `POST .../submit` → `PENDING_HR_REVIEW`; `POST .../issue` → `ISSUED` with issue metadata (`issueNote`, `reviewDueDate`, `issuedBy` / `issuedAt`).
- State transition guards (no skipping steps; idempotent or clear errors on invalid transitions).
- Audit: `CREATE`, `UPDATE`, and `OTHER` for submit and issue (Section 3.4).
- Notifications: on submit (HR_ADMIN + HR_STAFF); on issue (target STAFF) — Section 2 “Datafin Notification Targets”.

**Exit criteria:** A warning can move `DRAFT` → `PENDING_HR_REVIEW` → `ISSUED` with full audit and the intended notifications.

### Sprint 3 — Acknowledgement and refusal handling

**Goal:** Close the loop on Section 1(E) and employee-visible issuance.

- `POST .../acknowledge` → `ACKNOWLEDGED` (employee self or HR on behalf with note, per Section 3.3).
- Support recording a refusal event (status or parallel event log) with note when the employee does not acknowledge, without forcing invalid states — match your legal/UX choice (e.g. remain `ISSUED` with `acknowledgementRefusedAt` / sub-status).
- Audit every acknowledgement or refusal outcome.
- Notification: on acknowledgement (issuing HR + optional manager) — Section 2.

**Exit criteria:** Issued warnings can be acknowledged or refusal can be recorded and audited; employees see only what policy allows.

### Sprint 4 — Appeal branch (open, review, decision)

**Goal:** Implement the full appeal sub-flow in Section 1(G) and Section 2.

- `POST .../appeal` → `APPEAL_OPEN` (self or HR on behalf); store appeal reason, statement, attachments.
- `POST .../appeal/review` → `APPEAL_REVIEW` (or equivalent in-progress state if you split “submitted” vs “under review”).
- `POST .../appeal/decision` with outcomes: uphold, amend (e.g. severity change), void — map to `APPEAL_UPHELD`, `APPEAL_AMENDED`, `APPEAL_VOIDED` and return warning to a consistent post-decision status (e.g. back to `ACKNOWLEDGED` / `ISSUED` variant or straight to `VOIDED` per product rules).
- Audit all appeal transitions; notifications as needed (employee + HR on decision).

**Exit criteria:** Appeal path is exercisable end-to-end with role checks (HR only for review/decision) and immutable audit history.

### Sprint 5 — Closure, escalation, and void

**Goal:** Section 1(H) resolution paths and escalation tooling.

- `POST .../resolve` → `RESOLVED`; `POST .../void` → `VOIDED`; `POST .../escalate` → `ESCALATED` (or severity/case escalation per your model).
- HR-only enforcement for these endpoints; validate status prerequisites.
- Audit resolve / void / escalate; notifications to HR team and direct manager where applicable (Section 2).
- Implement or wire **Datafin Escalation Rules** (Section 2): rolling 12-month active warning count flag, mandatory follow-up for `FINAL`, suggestions when repeated same-category incidents occur during monitoring (can start as flags/recommendations in UI or reports before full automation).

**Exit criteria:** HR can resolve, void, and escalate per policy; escalation signals are visible to HR (even if rule automation is MVP+ within this sprint).

### Sprint 6 — Employee detail UI and activity feed

**Goal:** Section 4 in production-quality form.

- Warning list on employee detail: active first, then history; filters for status, severity, category.
- Role-based action buttons (create draft, submit, issue, acknowledge, appeal, appeal review, resolve, escalate, void) wired to the APIs and disabled/hidden by state.
- Optional: employee feed rows with `feedVariant: warning` for key events (issued, acknowledged, appeal, resolved).

**Exit criteria:** Primary personas can complete their workflows from the UI without ad-hoc API calls.

### Sprint 7 — Hardening: retention, immutability, and operational readiness

**Goal:** Section 1(I) and production concerns.

- **Done (backend):** Immutability contract documented in **§3.6**; `PATCH` limited to `DRAFT`; workflow-only updates thereafter; controller header + clearer 400 message on illegal draft edits. Composite index `@@index([tenantId, userId, createdAt(sort: Desc)])` for list ordering; `GET .../warnings` supports pagination; optional **Resend email** to HR on submit-for-review (in-app notify unchanged).
- **Retention / export:** Policy-only guidance in **§3.7** (no automated retention or export API unless product later requires it).
- **Support runbook:** Use §3.6 (who can change what), §2 role matrix, and state lists under §2 for common 403/400 cases.

**Exit criteria:** Audit trail is trustworthy; list APIs scale for typical tenant size; support can troubleshoot permission and state errors.

### Sprint 8 (optional) — Corrective monitoring (CAP/PIP) linkage

**Goal:** Section 1(F) if product commits beyond core warnings.

- Link warnings to CAP/PIP entities (action items, owners, due dates, checkpoints).
- UI for monitoring window progress; optional notifications on overdue items.

**Exit criteria:** HR can associate a warning with a corrective plan and track checkpoints.

---

**Summary dependency chain:** Sprint 1 → 2 → (3, 4, and 5 can parallelize on different branches once issue path exists; 5 benefits from 3–4 for complete notification coverage) → 6 after core APIs stable → 7 ongoing/last → 8 optional.

