# Employee Warnings — Action Buttons (Frontend Display)

This document describes **how action buttons should be shown** in the Datafin HRMS UI for employee warnings: **who** sees them, **when** (by status), **how** (layout and interaction), and what to **hide** per role.

It complements:

- Lifecycle and roles: [`employee-warning-flow.md`](./employee-warning-flow.md) (Sections 2–4).
- Full action matrix and API mapping: [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) (Sections 3, 5–6).

---

## Walkthrough (how, who, when)

### How (same rules for every role)

| Rule | Detail |
|------|--------|
| **Placement** | **One horizontal action strip** on the warning **detail** (e.g. [`DisciplineDetailDialog`](../../../frontend/components/dashboard/discipline/DisciplineDetailDialog.tsx)). |
| **Density** | **At most** 1 **primary** (solid / brand, e.g. orange), **0–2 secondaries** (outline), and the rest in **More** (`⋯` / `DropdownMenu`). |
| **Hide vs disable** | **Hide** actions the role must **never** use. **Disable + tooltip** only when the role *could* use the action but the current substates or validation block it (uncommon before API wiring; prefer refetch after mutations once live). |
| **Interaction** | **Click** → **short modal** (or slide-over) with the fields from [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) §3 → later: API + toast + invalidate; UI-only phase: toast + close modal. |
| **Destructive** | **Void** and similar: **More** menu or destructive-styled button **plus** confirm dialog — never the default primary. |

### Who (three audiences)

| Audience | Responsibility in the UI |
|----------|---------------------------|
| **HR_ADMIN / HR_STAFF** | Full HR workflow: submit path (when they created/edited drafts), **issue**, **acknowledge / refuse / open appeal on behalf**, **appeal review** and **decision**, **resolve**, **void**, **escalate**. |
| **DEPARTMENT_ADMIN** | Only **create / edit / submit** for employees they manage. **No** issue, resolve, void, escalate, or appeal review/decision. |
| **STAFF** | **Own** warnings only: **acknowledge**, **refuse acknowledgement**, **open appeal** on suitable statuses. Typically a **simpler** strip than HR — not a mirror of the discipline admin dialog unless product explicitly reuses one component. |

### When — quick map by role

- **HR:** full status table in **§4** below.
- **Department admin:** **§5** below.
- **Staff:** **§6** below.

### Who never sees what

| Role | Must **not** see (hide, not only disable) |
|------|---------------------------------------------|
| **DEPARTMENT_ADMIN** | Issue warning, Resolve, Void, Escalate, Move to appeal review, Record appeal decision (Uphold / Amend / Void), and other HR-only endpoints from [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) §3. |
| **STAFF** | Submit for review, Issue, Return to draft, HR appeal review/decision, Resolve, Void, Escalate, and any “on behalf” HR actions when viewing **someone else’s** record. (On **own** record: only self-service actions apply.) |

---

## 1) Placement

- Use **one horizontal action strip** on the warning **detail** surface: typically **bottom of the left column**, above or below the documents block — **pick one position and keep it consistent** across discipline and employee profile.
- The **same strip** is always present structurally; only **which controls are visible** changes by `warning.status` and **viewer role** (and `employeeId` vs `currentUserId` for STAFF).
- **Table / list** rows: keep **View** (or row click) as the main entry; optional overflow for **Continue draft** when status is `DRAFT` and the user owns the draft.

---

## 2) Composition (how many buttons at once)

Avoid showing every allowed API action as a flat row of equals.

| Slot | Count | Style (typical) | Purpose |
|------|-------|-----------------|--------|
| **Primary** | **1** | Solid / brand (e.g. orange) | The single “next step” for this status and role |
| **Secondary** | **0–2** | Outline | Common alternates (e.g. Escalate next to Resolve) |
| **More** | Optional | `⋯` dropdown (`DropdownMenu`) | Rare, destructive, crowded “on behalf” actions, or extras for `ISSUED` |

**Appeal decision** (`UPHOLD` / `AMEND` / `VOID`): either **three** secondary buttons **or** one **Record decision** primary that opens a modal with the three outcomes — the **modal pattern** scales better on narrow screens.

---

## 3) Visibility rules

- **Hide** controls the role must **never** use (see **Who never sees what** above and [`employee-warning-flow.md`](./employee-warning-flow.md) §2).
- **Disable + tooltip** when the role may use the action but **validation** fails (e.g. empty required field in a preceding step); once APIs exist, prefer **refetch** after mutation so the strip matches server state.
- **STAFF:** prefer a **dedicated lighter UI** for acknowledge/refuse/appeal; avoid dumping the full HR **More** menu into the employee self-service view.

---

## 4) Suggested strip by status (HR / HR_STAFF view)

Map each action to the endpoints in [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) §3. This table is **display-oriented** (primary / secondary / More); the UI guide remains authoritative for every allowed API action.

| Status | Primary | Secondary | More (examples) |
|--------|---------|-----------|-----------------|
| `DRAFT` | Submit for review | Edit draft | — (optional delete draft if product adds API) |
| `PENDING_HR_REVIEW` | Issue warning | — | Return to draft / request changes (if implemented) |
| `ISSUED` | Often **none** — no single “next” for HR; *or* **Acknowledge on behalf** if you promote one action | — | Resend notification, Open appeal on behalf, Refuse ack on behalf, Resolve, Void, Escalate — **trim** to policy; do **not** expose every API combo as equal-weight buttons |
| `ACKNOWLEDGED` | Resolve | Escalate | Void, Open appeal on behalf |
| `APPEAL_OPEN` | Move to appeal review | — | Void (if policy allows) |
| `APPEAL_REVIEW` | Record decision (modal) *or* Uphold / Amend / Void | — | — |
| `APPEAL_UPHELD` | Resolve | Escalate | Void |
| `APPEAL_AMENDED` | Resolve | Escalate | Void |
| `APPEAL_VOIDED` | — | — | Read-only; optional **Export** in More later |
| `ESCALATED` | Resolve *or* follow-up primary per policy | — | Void |
| `RESOLVED` / `VOIDED` | — | — | Read-only; optional **Export** in More |

**Note on `ISSUED`:** HR often has **many** legal actions; the strip should **not** show seven primary-looking buttons. Prefer **More** for “on behalf”, resend, void, escalate until the product picks a default story for that tenant.

---

## 5) Department admin strip

- **Same placement** as HR (one strip on detail).
- **When:** Only while the warning is in **`DRAFT`** (and optionally while editing before submit — still `DRAFT`).
- **Primary:** Submit for review (after intake is ready).
- **Secondary:** Edit draft.
- **Hide** all HR-only actions: Issue, Resolve, Void, Escalate, Move to appeal review, appeal decision (Uphold / Amend / Void), and the heavy **`ISSUED`** HR **More** list.
- After status moves to **`PENDING_HR_REVIEW`** or beyond, department admin typically **view-only** on that record (per [`employee-warning-flow.md`](./employee-warning-flow.md) §2 — cannot issue). Hide the forward-action strip or show read-only copy (“With HR for review”).

---

## 6) Staff (own warnings only)

Applies when **`employeeId === currentUserId`** and the list/detail is the **employee self-service** context. Backend often **omits** `DRAFT` and `PENDING_HR_REVIEW` from STAFF list responses; the UI should still handle any status defensively.

| Status | Primary | Secondary / More |
|--------|---------|------------------|
| `ISSUED` | Acknowledge | More: Refuse acknowledgement, Open appeal (if policy allows) |
| `ACKNOWLEDGED` | Open appeal (if still in window) | — |
| Other visible statuses | — | Usually **read-only** (no HR strip) |

If draft/pending rows ever appear by mistake: **read-only** only — no submit/issue.

---

## 7) Modals and forms

Each workflow `POST` should open a **short modal** (or slide-over) with the fields documented in [`employee-warning-flow.md`](./employee-warning-flow.md) §3.2 / [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md) §3:

- Submit → `reviewNote` (optional)
- Issue → `issueNote`, `reviewDueDate`
- Acknowledge / refuse → acknowledgement or refuse note per API
- Appeal → reason, statement, attachments
- Appeal decision → `decision`, `decisionNote`, `updatedSeverity` when `AMEND`
- Resolve / void / escalate → respective note fields

This keeps the action strip small while staying aligned with the API contract.

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

Render **primary** + **secondary** as `Button`s and **more** as `DropdownMenuItem`s. Wire each `ActionDef` to `onClick` → open modal → (later) call API → invalidate queries. UI-only phase: modal validate → toast → close.

---

## 9) Reference checklist

- [ ] One strip per detail view; position consistent across discipline + employee profile.
- [ ] At most one primary + two secondaries visible; overflow to More.
- [ ] Void (and similar) confirmed and not default primary.
- [ ] Role matrix: **hide** forbidden actions; disable + tooltip only when transition/validation invalid.
- [ ] `ISSUED` (HR): trimmed **More** menu, not seven equal buttons.
- [ ] Department admin: submit/edit only in `DRAFT`; no HR actions visible.
- [ ] Staff: simplified strip; acknowledge / refuse / appeal only where applicable.
- [ ] Modals carry the JSON fields expected by each endpoint.
