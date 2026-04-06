# Discipline / case UI vs backend — dedicated features

This note lists **what the discipline and employee “case” UIs show or imply** compared to **what exists as dedicated backend support today**. It ignores whether the frontend is wired to the API; it only asks whether a backend capability or route exists.

Related:

- API lifecycle: [`api/employee-warning-api.md`](./api/employee-warning-api.md)
- UI flow: [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md), [`employee-warning-action-buttons.md`](./employee-warning-action-buttons.md)

---

## What already has backend support

The **case / employee-warning lifecycle** used by the discipline detail view and action strip is largely implemented:

- List cases for an employee (`GET /api/employees/:id/warnings`)
- Discipline queue list (`GET /api/employees/warnings/dashboard`) with **status** filter and pagination
- Draft CRUD, submit, return to draft, issue, resend notification, attachments upload/download/delete
- Acknowledge, refuse acknowledgement, appeal + review + decision, resolve, void, escalate

Routes live in `backend/routes/employee.route.js`; handlers in `backend/controllers/employee-warning.controller.js`.

---

## Gaps — UI or product expectation without a dedicated backend (yet)

### 1. Per-case Activity / workflow timeline

The detail UI is designed around a **chronological activity feed** per case.

- There is **no** `GET …/warnings/:warningId/timeline` (or equivalent) on the employee routes.
- **Audit data** is written (`addLog`, `AuditLog` with `entityType` / `entityId` in Prisma), but **`getAuditLogs`** does not expose filtering by **`entityId` + `entityType`** for a single case—it is tenant-scoped with generic search.

**Implication:** Either extend the audit API to filter by entity, or add a warning-scoped “activity” endpoint that maps audit rows (or a future events table) to the UI timeline shape.

### 2. Formal warning letter PDF

- Issue flow sends **email** (`sendWarningIssuedEmail`).
- There is **no** backend service that **generates a warning letter PDF** (by contrast, payslips use PDF generation in `backend/services/payslip-generator.service.js`).
- Product copy may refer to an **attachment**; attaching a generated letter is **not** implemented end-to-end.

### 3. Export case record

- The UI includes **export (coming soon)**-style actions.
- There is **no** endpoint that exports a case (e.g. PDF bundle, zip of attachments + metadata).

### 4. Duplicate as draft

- Row actions may offer **duplicate as draft**.
- There is **no** **clone / duplicate** API that creates a new draft from an existing case.

### 5. GET single case by id

- **`GET /api/employees/:id/warnings`** returns a **paginated list**.
- Mutations use `:warningId`, but there is **no** **`GET /api/employees/:id/warnings/:warningId`** for a single resource read.
- This can be worked around by finding an item in the list response, but a **dedicated read** is not present.

### 6. Discipline header: search and severity (and richer filters)

- **`listDisciplineWarningsDashboard`** supports **pagination** and **status** (`status` query param).
- It does **not** implement **free-text search** (e.g. employee name, case title, policy reference) or **severity** filtering as query parameters.
- **`listEmployeeWarnings`** similarly exposes list + pagination (and staff visibility rules), not the same filter set the Discipline header UI suggests.

### 7. Compliance management tab

- The discipline page **Compliance management** tab is a **placeholder** in the UI.
- There is **no** separate compliance module or routes tied to that tab.

---

## Related backend behavior (escalation summary)

- **`GET /api/employees/:id/warnings`** — top-level **`escalationSummary`** for the employee.
- **`GET /api/employees/:id/warnings/escalation-summary`** — same payload without loading the case list.
- **`GET /api/employees/warnings/dashboard`** — each row includes **`escalationSummary`** for that row’s subject (employee-level pattern signals; repeated per row for the same person).

---

## Change log

| Date       | Notes |
| ---------- | ----- |
| 2026-04-06 | Initial list from UI vs `employee.route.js` / `employee-warning.controller.js` review. |
| 2026-04-06 | Bridged escalation: dashboard per-row `escalationSummary` + dedicated `GET .../warnings/escalation-summary`. |
