# Employee Warnings — Action Buttons (Frontend Display)

This document describes **how action buttons should be shown** in the Datafin HRMS UI for employee warnings: placement, density (primary / secondary / overflow), and status- and role-based visibility.

It complements:

- Lifecycle and roles: [`employee-warning-flow.md`](./employee-warning-flow.md) (Sections 2–4).
- Full action matrix and API mapping: [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) (Sections 3, 5–6).

---

## 1) Placement

- Use **one horizontal action strip** on the warning **detail** surface (e.g. [`DisciplineDetailDialog`](../../../frontend/components/dashboard/discipline/DisciplineDetailDialog.tsx)): typically **bottom of the left column**, above or below the documents block — **pick one position and keep it consistent** across discipline and employee profile.
- The **same strip** is always present; only **which controls are visible** changes by `warning.status` and user role.
- **Table / list** rows: keep **View** (or row click) as the main entry; optional overflow for **Continue draft** when status is `DRAFT` and the user owns the draft.

---

## 2) Composition (how many buttons at once)

Avoid showing every allowed API action as a flat row of equals.

| Slot | Count | Style (typical) | Purpose |
|------|-------|-----------------|--------|
| **Primary** | **1** | Solid / brand (e.g. orange) | The single “next step” for this status and role |
| **Secondary** | **0–2** | Outline | Common alternates (e.g. Escalate next to Resolve) |
| **More** | Optional | `⋯` dropdown (`DropdownMenu`) | Rare, destructive, or “three-way” flows |

**Destructive** actions (especially **Void**) should live in **More** or use a **destructive** variant + confirmation modal, never as the default primary.

**Appeal decision** (`UPHOLD` / `AMEND` / `VOID`): either **three** secondary buttons **or** one **Record decision** primary that opens a modal with the three outcomes — the modal pattern scales better on small widths.

---

## 3) Visibility rules

- **Hide** controls the user’s role must **never** use (e.g. `DEPARTMENT_ADMIN` must not see Issue, Resolve, Void, Escalate, appeal review/decision — see [`employee-warning-flow.md`](./employee-warning-flow.md) §2 and [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) §6).
- **Disable + tooltip** when the role may use the action but the **current substate** blocks it (e.g. validation not met); prefer **refetch after mutation** so the strip stays aligned with the server state machine.
- **STAFF** self-service: use a **simpler** surface when possible (acknowledge / refuse / appeal only); do not mirror the full HR strip unless the product intentionally uses one dialog for all roles.

---

## 4) Suggested strip by status (HR / HR_STAFF view)

Map each row to the endpoints in [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) §3. This table is **display-oriented** (primary / secondary / more); the UI guide remains authoritative for every allowed API action.

| Status | Primary | Secondary | More (examples) |
|--------|---------|-----------|------------------|
| `DRAFT` | Submit for review | Edit draft | — (optional delete draft if product adds API) |
| `PENDING_HR_REVIEW` | Issue warning | — | Return to draft / request changes (if implemented) |
| `ISSUED` | — or **Acknowledge on behalf** (if offered) | — | Resend notification, Open appeal on behalf, Refuse ack on behalf, Resolve, Void, Escalate (subset per policy) |
| `ACKNOWLEDGED` | Resolve | Escalate | Void, Open appeal on behalf |
| `APPEAL_OPEN` | Move to appeal review | — | Void (if policy allows) |
| `APPEAL_REVIEW` | Record decision (modal) *or* Uphold / Amend / Void | — | — |
| `APPEAL_UPHELD` | Resolve | Escalate | Void |
| `APPEAL_AMENDED` | Resolve | Escalate | Void |
| `APPEAL_VOIDED` | — | — | Read-only; optional export later |
| `ESCALATED` | Resolve *or* follow-up primary per policy | — | Void |
| `RESOLVED` / `VOIDED` | — | — | Read-only; optional **Export** in More |

Exact items under **More** for `ISSUED` should be trimmed to what the product and legal workflow require; the API allows more combinations than the default strip should show.

---

## 5) Department admin strip

- Same placement as HR.
- **Primary:** Submit for review (when `DRAFT` or after edits).
- **Secondary:** Edit draft.
- **Hide** all HR-only actions (issue, resolve, void, escalate, appeal review, appeal decision).

---

## 6) Staff (own warnings only)

- **Primary:** Acknowledge (when `ISSUED`).
- **Secondary / More:** Refuse acknowledgement, Open appeal as needed.
- Do not show draft / pending review rows if the list API omits them; if shown by mistake, **read-only** only.

---

## 7) Modals and forms

Each workflow `POST` should open a **short modal** (or slide-over) with the fields documented in [`employee-warning-flow.md`](./employee-warning-flow.md) §3.2 / [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) §3:

- Submit → `reviewNote` (optional)
- Issue → `issueNote`, `reviewDueDate`
- Acknowledge / refuse → acknowledgement or refuse note per API
- Appeal → reason, statement, attachments
- Appeal decision → `decision`, `decisionNote`, `updatedSeverity` when `AMEND`
- Resolve / void / escalate → respective note fields

Keeps the action strip visually small while staying aligned with the contract.

---

## 8) Implementation hint (frontend)

Centralize logic in a helper, e.g. `getWarningActionStrip({ status, role, employeeId, currentUserId })`, returning:

```ts
{
  primary: ActionDef | null
  secondary: ActionDef[]
  more: ActionDef[]
}
```

Render **primary** + **secondary** as `Button`s and **more** as `DropdownMenuItem`s. Wire each `ActionDef` to `onClick` → open modal → call API → invalidate queries.

---

## 9) Reference checklist

- [ ] One strip per detail view; position consistent across discipline + employee profile.
- [ ] At most one primary + two secondaries visible; overflow to More.
- [ ] Void (and similar) confirmed and not default primary.
- [ ] Role matrix: hide forbidden actions; disable + tooltip only when transition invalid.
- [ ] Modals carry the JSON fields expected by each endpoint.
