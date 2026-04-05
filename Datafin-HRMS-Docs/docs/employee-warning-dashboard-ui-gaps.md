# Employee Warnings — Missing or Incomplete Dashboard UI

This document lists **UI gaps only** (screens, controls, layout, and in-app wiring between components). It does **not** track backend/API integration.

Related docs:

- Target behaviour: [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md), [`employee-warning-action-buttons.md`](./employee-warning-action-buttons.md)
- Web implementation today: `frontend/app/dashboard/discipline`, `frontend/components/dashboard/discipline/*`, `frontend/app/dashboard/employee/[id]/page.tsx`

---

## 1) Employee profile — no warnings surface

**Expected (per UI guide):** A **Warnings** block or tab on **`/dashboard/employee/[id]`** — list with **active / open** items visually above **history** (resolved, voided, ended appeals); row or card opens the same detail pattern as discipline.

**Current:** Employee detail page has no warnings section at all (no list, no tab, no entry point from profile).

---

## 2) HR-only escalation banner (profile context)

**Expected:** When list/detail responses would eventually expose **`escalationSummary`** (`suggestEscalationReview`, `hasActiveFinalWarning`), show a **compact, non-blocking alert** at the top of the warnings panel for **HR** (not for staff viewing others).

**Current:** No warnings panel on profile, and no equivalent banner on the discipline page.

---

## 3) Compliance management tab — empty shell

**Expected:** The **Compliance management** tab on **`/dashboard/discipline`** should host its own content (placeholders, coming-soon, or real compliance UI — product-defined).

**Current:** Selecting the tab renders an **empty** `<div>` — no copy, layout, or navigation.

---

## 4) Discipline header ↔ table — search and filters not wired

**Expected:** Search and **status / severity** filters in **`DisciplineHeader`** should **drive** what **`DisciplineTable`** displays (client-side filtering/sorting on current data is enough for UI completeness).

**Current:** Header and table are **siblings without shared state**; changing search or filters does **not** change the table.

---

## 5) Category filter — not present

**Expected (per UI guide §8):** Filters for **status**, **severity**, and **category** (chips or selects consistent with enums).

**Current:** Discipline header exposes **status** and **severity** only — **no category** filter control.

---

## 6) Role-correct action strip on discipline detail

**Expected:** **`DisciplineDetailDialog`** should receive **`viewerRole`** (and, for staff self-service later, **`viewerUserId`** / **`warningSubjectUserId`**) from the **signed-in user** context. **Department admin** should see the **reduced** strip from `getWarningActionStrip` (draft submit/edit/delete only; read-only helper after submit). **HR** sees the full strip.

**Current:** Dialog defaults to **`viewerRole="HR_STAFF"`**; **`DisciplineTable`** does not pass role from auth — so the UI always presents the **HR-style** action strip in the discipline flow.

---

## 7) Optional / polish (still UI)

| Item | Note |
|------|------|
| **Deep link** | Open discipline with a **highlighted** row / query param — not required by docs but improves UX when linking from notifications. |
| **Export** | Strip includes **“Export (coming soon)”** for some terminal states — full export UI not specified. |
| **Combined feed** | If employee activity feed shows **`WARNING`** / `warning_*` variants, profile feed UI should match guide §7 — verify when feed is visible on the same page as profile. |

---

## 8) What is already in place (UI shells)

For context only — these exist as **visual/UX structure** (behaviour may still be mock/toast until API work):

- **`/dashboard/discipline`** — Discipline tab with header, table, column controls, sort, detail dialog, new-warning modal, edit-draft modal, document blocks, activity/timeline area, **`WarningActionBar`** with modals.
- **More menu** entry to discipline.
- **`warningActionStrip.ts`** — logic for HR vs department admin vs staff strips (must be **fed** correct `viewerRole` in the discipline page).

---

## 9) Checklist (UI-only)

- [ ] Warnings panel (or tab) on **`/dashboard/employee/[id]`** with active vs history layout.
- [ ] Escalation summary **banner** component on that panel (HR-only; hidden until data exists or use mock flag for design review).
- [ ] **Compliance** tab content on discipline page (minimum: placeholder layout + copy).
- [ ] Lift **search + filters** state to discipline page (or equivalent) and **filter** table data.
- [ ] Add **category** filter to discipline header (or filters sheet).
- [ ] Read **role** from auth store (or props) and pass **`viewerRole`** into **`DisciplineDetailDialog`** from **`DisciplineTable`** (and any future profile warnings entry).

---

*Scope: dashboard web UI for `HR_ADMIN`, `HR_STAFF`, and `DEPARTMENT_ADMIN`. Mobile self-service is covered in [`employee-warning-mobile-self-service.md`](./employee-warning-mobile-self-service.md).*
