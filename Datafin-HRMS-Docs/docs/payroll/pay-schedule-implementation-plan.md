# Pay Schedule Implementation Plan

## Overview

Introduce **pay schedules** as the "when do we pay?" configuration. Schedules define frequency and rules; the system generates **pay periods** from them. Create Payroll Run continues to use a **pay period selector** (no change to that flow).

---

## 1. Schema (Prisma)

### 1.1 New model: `PaySchedule`

- `id` (uuid, PK)
- `tenantId` (FK → Tenant, cascade on delete)
- `name` (e.g. "Semi-monthly", "Bi-weekly")
- `frequency`: enum — `SEMI_MONTHLY` | `BI_WEEKLY` | `MONTHLY` | `WEEKLY` (extend as needed)
- `config`: JSON or dedicated fields for rules, e.g.:
  - Semi-monthly: `{ "dates": [1, 15] }` or `{ "dates": [15, "last"] }`
  - Bi-weekly: `{ "anchorDate": "2025-01-03" }` (first pay Friday)
- `createdAt`, `updatedAt`
- Indexes: `tenantId`

### 1.2 PayPeriod changes (optional but recommended)

- Add `payScheduleId` (nullable FK → PaySchedule, SetNull on delete)
- Enables "which schedule generated this period?" and per-schedule generation

### 1.3 Migrations

- Create `PaySchedule` table
- Add `payScheduleId` to `PayPeriod` if applicable
- Run migrations

---

## 2. Backend

### 2.1 Pay Schedule CRUD

- **Routes:** e.g. under `/api/pay-schedules`
  - `POST /` — create schedule
  - `GET /` — list by tenant (with filters if needed)
  - `GET /:id` — get one
  - `PATCH /:id` — update
  - `DELETE /:id` — delete (check no dependent periods or handle softly)
- **Controller + validation:** `name`, `frequency`, `config` per frequency type
- **Authorization:** same as pay-periods (e.g. HR_ADMIN for mutate, HR_ADMIN/HR_STAFF for read)

### 2.2 Generate periods from schedule

- **Endpoint:** `POST /api/pay-schedules/:id/generate-periods`
- **Body:** e.g. `{ "fromDate": "2025-01-01", "toDate": "2025-12-31" }` or `{ "count": 12 }` ("next 12 periods")
- **Service logic:**
  - Load schedule, validate tenant
  - Compute date ranges from `frequency` + `config` (no overlap)
  - For each range: derive `periodName`, `calendarMonth`, `calendarYear` (reuse `getCalendarMetadata` / existing helpers)
  - Create `PayPeriod` records; set `payScheduleId` when linking
  - Skip or error on overlapping existing periods (tenant-scoped)
- **Response:** created periods (and count)

### 2.3 Pay Period

- Keep existing `createPayPeriod` for **manual** creation (name, start, end).
- Generated periods use the same `PayPeriod` model; no change to payroll-run flow.

---

## 3. Frontend

### 3.1 Setup / Pay Schedules

- **Location:** Under Payroll → Setup (or dedicated "Pay schedules" section).
- **Screens:**
  - List pay schedules (name, frequency, config summary).
  - Create form: name, frequency selector, config fields (e.g. dates for semi-monthly, anchor for bi-weekly).
  - Edit form: same fields.
- **APIs:** Use new pay-schedule CRUD.

### 3.2 Periods

- **Keep:** Existing "Create period" (manual) — name, start date, end date.
- **Add:** "Generate from schedule" action:
  - Select pay schedule (dropdown).
  - Option: "Next N periods" or "From – to" date range.
  - Call `POST /pay-schedules/:id/generate-periods`, then refresh periods list.
- **List:** Optional "Source" column (manual vs schedule name) if `payScheduleId` is set.

### 3.3 Create Payroll Run

- **No change:** Still select **pay period** from dropdown. Periods can be manual or schedule-generated.

---

## 4. Implementation Order

1. Schema: add `PaySchedule`, optionally `PayPeriod.payScheduleId` → migrate.
2. Backend: pay-schedule CRUD (routes, controller, validation).
3. Backend: generate-periods service + endpoint.
4. Frontend: Setup → Pay schedules UI (list, create, edit).
5. Frontend: Periods → "Generate from schedule" + wire to generate API.
6. Smoke-test: create schedule → generate periods → create payroll run from generated period.

---

## 5. Out of Scope (for later)

- Multiple schedules per tenant (e.g. different schedules for different employee groups); current plan assumes one or more schedules, with generation independent per schedule.
- Assigning employees to a specific schedule (Employee ↔ PaySchedule); generation remains schedule-based, not employee-based.
- Pay date / payment execution (schedule only defines period dates).
