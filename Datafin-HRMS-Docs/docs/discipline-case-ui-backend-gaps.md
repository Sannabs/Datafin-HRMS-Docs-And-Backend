# Discipline / case UI vs backend — dedicated features

This note lists **what the discipline and employee “case” UIs show or imply** compared to **what exists as dedicated backend support today**. It ignores whether the frontend is wired to the API; it only asks whether a backend capability or route exists.

Related:

- API lifecycle: [`api/employee-warning-api.md`](./api/employee-warning-api.md)
- UI flow: [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md), [`employee-warning-action-buttons.md`](./employee-warning-action-buttons.md)

---

## What already has backend support

The **case / employee-warning lifecycle** used by the discipline detail view and action strip is largely implemented:

- List cases for an employee (`GET /api/employees/:id/warnings`)
- Discipline queue list (`GET /api/employees/warnings/dashboard`) with **status**, **search**, **severity**, pagination
- Single case read (`GET /api/employees/:id/warnings/:warningId`)
- Per-case **timeline** (`GET /api/employees/:id/warnings/:warningId/timeline`) from `AuditLog` (`entityType: EmployeeWarning`, `entityId: warningId`). HR-wide audit list can also filter by **`entityId`** + **`entityType`** (`GET /api/audit-logs`, HR_ADMIN).
- **Duplicate as draft** (`POST /api/employees/:id/warnings/:warningId/duplicate`) — copies core fields; attachments are **not** copied
- **Formal letter PDF** (`GET /api/employees/:id/warnings/:warningId/letter-pdf`) — HTML template + Puppeteer (see `backend/services/warning-letter-pdf.service.js`)
- **Export package** (`GET /api/employees/:id/warnings/:warningId/export`) — ZIP: `case-manifest.json`, `warning-letter.pdf`, `attachments/*`
- Draft CRUD, submit, return to draft, issue, resend notification, attachments upload/download/delete
- Acknowledge, refuse acknowledgement, appeal + review + decision, resolve, void, escalate

Routes live in `backend/routes/employee.route.js`; handlers in `backend/controllers/employee-warning.controller.js`.

---

## Gaps — UI or product expectation without a dedicated backend (yet)

### ~~1. Per-case Activity / workflow timeline~~ **Addressed**

- `GET /api/employees/:id/warnings/:warningId/timeline` returns audit-derived events (newest first). Optional `?limit=` (default 100, max 200).

### ~~2. Formal warning letter PDF~~ **Addressed**

- `GET .../letter-pdf` returns `application/pdf`. Template: `backend/templates/warning-letter.html` (override path: `WARNING_LETTER_TEMPLATE_PATH`).

### ~~3. Export case record~~ **Addressed**

- `GET .../export` returns `application/zip` with manifest, generated letter PDF, and attachment files (best-effort per file).

### ~~4. Duplicate as draft~~ **Addressed**

- `POST .../duplicate` creates a new **DRAFT** for the same employee; **`duplicatedFromWarningId`** is included in the JSON response (`data`).

### ~~5. GET single case by id~~ **Addressed**

- `GET /api/employees/:id/warnings/:warningId` returns the same **warningToDto** shape as list items.

### ~~6. Discipline header: search and severity (and richer filters)~~ **Addressed**

- **`GET /api/employees/warnings/dashboard`**: optional `search` (title, policy reference, employee name / email / employeeId) and `severity` (comma-separated `LOW|MEDIUM|HIGH|FINAL`). Existing `status` unchanged.
- **`GET /api/employees/:id/warnings`**: same **`search`** and **`severity`**; optional **`status`** (single) and **`category`** apply when the caller is **not** `STAFF` (staff list remains “non-hidden” statuses only).

### 7. Compliance management tab

- The discipline page **Compliance management** tab is a **placeholder** in the UI.
- There is **no** separate compliance module or routes tied to that tab.

---


## Change log

| Date       | Notes |
| ---------- | ----- |
| 2026-04-06 | Initial list from UI vs `employee.route.js` / `employee-warning.controller.js` review. |
| 2026-04-06 | Items 1–6 bridged: timeline, letter PDF, ZIP export, duplicate, GET by id, dashboard/employee list search + severity (+ list status/category for non-staff). |
