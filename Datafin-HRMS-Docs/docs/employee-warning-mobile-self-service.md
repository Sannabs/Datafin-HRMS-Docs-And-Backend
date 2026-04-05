# Employee Warnings — Mobile App Self-Service (UI Flow & Plan)

This document describes the **intended UI flow and screen plan** when **employees (`STAFF`)** use a **native or hybrid mobile app** to view and act on **their own** warning records. It complements:

- Lifecycle and roles: [`employee-warning-flow.md`](./employee-warning-flow.md)
- Action visibility: [`employee-warning-action-buttons.md`](./employee-warning-action-buttons.md) (§6 Staff)
- Web integration: [`employee-warning-ui-guide.md`](./employee-warning-ui-guide.md)
- API: [`api/employee-warning-api.md`](./api/employee-warning-api.md)

**Scope:** Self-service only — **no** discipline queue, **no** HR issue/review/resolve/void/escalate on mobile for staff. Department admin and HR workflows remain on web (or separate admin surfaces) unless product explicitly expands later.

---

## 1) Product goals (mobile)

| Goal | Detail |
|------|--------|
| **Clarity** | Employee understands what the warning is, current status, and **exactly one** obvious next step when action is required. |
| **Trust** | Legible dates, policy references, and attachment access (when API provides URLs) without clutter. |
| **Low anxiety** | Acknowledgement framed as receipt, not admission; appeals explained in plain language. |
| **Reachability** | Push notification → correct screen in ≤2 taps after unlock. |

---

## 2) Information architecture

```
App root
└── Profile / Me (or Work tab)
    └── Warnings  [badge: count of items needing action, if any]
        ├── Warning list (pull-to-refresh)
        └── Warning detail  [per record]
            ├── Summary (scroll)
            ├── Attachments (optional section)
            ├── Activity / timeline (compact, read-only)
            └── Action area (sticky bottom or FAB — see §5)
                └── Tapping action → Full-screen sheet or modal → Submit → Success → pop/back + refresh list
```

**Naming (configurable per tenant):** Prefer **“Warnings”** or **“Disciplinary notices”** in nav; avoid HR jargon like “EmployeeWarning” in UI copy.

---

## 3) Entry points

| Entry | Behaviour |
|-------|-----------|
| **Profile → Warnings** | Always available to `STAFF`. Opens **list** (`GET /api/employees/:id/warnings` with `:id` = current user’s employee/user id consistent with other mobile profile APIs). |
| **Push notification** | Payload includes `warningId` (and tenant context). Tap opens **Warning detail** for that id (after `GET` detail or list+find). Deep link scheme TBD (e.g. `datafin://warnings/{warningId}` or universal link). |
| **Email link** | If email opens in-app browser, universal link should land on **same detail** or web fallback; ideally parity with push. |

**Note:** Backend may omit `DRAFT` and `PENDING_HR_REVIEW` from staff list responses; the app should still handle unexpected statuses **defensively** (read-only, no staff actions).

---

## 4) Screen plan

### 4.1 Warning list

**Purpose:** Show **my** warnings with status and what needs attention.

**Content:**

- Section or sort: **“Action required”** first (e.g. `ISSUED`), then **“In progress”** (e.g. appeal states visible to employee), then **“History”** (resolved, voided, etc.) — exact grouping is product choice; keep **needs action** visually above the fold.
- Row: **Title**, **status pill**, **incident or issued date**, **chevron**.
- Optional: small **unread** or **needs acknowledgement** indicator when `ISSUED` and not yet acked (derived from status until a dedicated flag exists).

**Actions:**

- Pull-to-refresh → refetch list.
- Tap row → **Warning detail**.

**Empty state:** “No warnings on file.” Short reassurance copy.

**Error state:** Retry; if 403, sign-out or “contact HR” message.

---

### 4.2 Warning detail

**Purpose:** Full context for **one** record; host the **staff action strip** and attachment list.

**Sections (top → bottom):**

1. **Header:** Title, status badge, severity (if policy allows staff to see it), key dates (incident, issued if set).
2. **What this means:** Short static explainer (one line) for `ISSUED` / `ACKNOWLEDGED` if helpful — optional, tenant-configurable.
3. **Summary / reason / issue note:** Render fields returned by API (plain text; support basic formatting if backend sends markdown later).
4. **Policy reference:** Monospace or subtle card if present.
5. **Attachments:** List with tap → preview (in-app WebView or native preview) or open URL; respect auth (signed URLs or tokenized download as per API).
6. **Activity timeline:** **Compact**, read-only, **newest-first** — mirror web’s audit-style events (issued, ack, appeal opened, decision summary) without HR-only noise. If API does not yet return a timeline, show **minimal** derived milestones from status + timestamps only.

**Actions:** See §5 (sticky bottom).

**Read-only states:** When no staff action applies, hide the action bar or show a single line: “No action required from you right now.”

---

### 4.3 Action flows (sheets / modals)

Each staff `POST` from [`employee-warning-action-buttons.md`](./employee-warning-action-buttons.md) maps to a **dedicated short flow**:

| Action | UI pattern | Fields (align with API) |
|--------|------------|-------------------------|
| **Acknowledge** | Full-screen **sheet** with primary **Submit** | Acknowledgement note per API (`employee-warning-flow.md` / API doc). |
| **Refuse acknowledgement** | Sheet; confirm step if destructive | Refusal note / reason fields per API. |
| **Open appeal** | Multi-step sheet **or** single long sheet with scroll | Appeal reason, statement, attachments (camera / files / photo library). |

**After success:** Toast or inline success, **pop** sheet, **invalidate** list + detail; status badge updates on next fetch.

**Failure:** Inline error on sheet; keep user input; support retry.

---

## 5) Action strip (staff) — mobile layout

Rules from **§6 Staff** in [`employee-warning-action-buttons.md`](./employee-warning-action-buttons.md):

| Status | Primary | Secondary / overflow |
|--------|---------|-------------------------|
| `ISSUED` | **Acknowledge** | **More (⋯):** Refuse acknowledgement, Open appeal (if policy allows) |
| `ACKNOWLEDGED` | **Open appeal** (if still allowed) | — |
| `DRAFT` / `PENDING_HR_REVIEW` (if ever shown) | — | Helper: “This notice is not visible to you yet or is with HR.” **No** submit/issue. |
| Other | — | Read-only; optional **Contact HR** deep link (mailto / intranet) — product choice |

**Mobile implementation notes:**

- Use a **sticky bottom bar** safe-area inset (iOS home indicator) **or** a single **FAB** only if it doesn’t obscure content; prefer **bar** for two-handed phones.
- **Primary:** full-width brand button (one).
- **Refuse** / **Appeal** in **overflow menu** or text button row under primary to avoid three equal-weight primaries.
- **Destructive** (refuse): use destructive styling inside sheet confirm, not as the default list primary.

---

## 6) Notifications (UX contract)

| Event | Push title/body (example) | Opens |
|-------|---------------------------|--------|
| Warning issued | “New disciplinary notice” + short title | Warning **detail** |
| Appeal outcome | “Update on your appeal” | Warning **detail** (scroll to timeline) |
| Resolved / voided (if employee notified) | “Your case was closed” | Warning **detail** or list |

**Badge:** App icon or tab badge = count of `ISSUED` items needing acknowledgement (or product-defined “action required” query).

---

## 7) Security & privacy

- All calls under **authenticated session** (same as web): bearer token or secure cookie pattern as mobile stack requires.
- **No** caching of warning bodies in logs; screenshots are OS-level — optional **screen capture** policy is out of scope here.
- **Biometric app lock** — product-wide; not warning-specific.

---

## 8) API alignment (no new contract required)

Reuse existing endpoints from [`api/employee-warning-api.md`](./api/employee-warning-api.md):

- List: `GET /api/employees/:id/warnings`
- Detail: use list item DTO or add dedicated `GET .../warnings/:warningId` if/when backend exposes it (mobile benefits from **single-record fetch** for deep links).
- Actions: `POST .../acknowledge`, `POST .../appeal`, and refuse-ack endpoint as documented.

**Pagination:** Mobile list uses infinite scroll or “Load more” with same `page` / `limit` query params.

---

## 9) Differences vs HR web discipline UI

| Aspect | HR web (`/dashboard/discipline`) | Mobile staff |
|--------|----------------------------------|--------------|
| Audience | HR / dept admin queues | **Self only** |
| Data source | Tenant dashboard + employee scope | **Own** `:id` only |
| Actions | Full lifecycle | **Acknowledge**, **refuse**, **open appeal** only |
| Density | Tables, filters, modals | **List + detail + sheets** |
| Timeline | Full audit (when wired) | **Abbreviated**, employee-safe wording |

---

## 10) Implementation checklist (mobile team)

- [ ] Nav entry **Warnings** under Me/Profile with optional badge.
- [ ] List screen + pull-to-refresh + pagination.
- [ ] Detail screen with sections in §4.2.
- [ ] Staff action strip per §5 + overflow menu.
- [ ] Three sheets: acknowledge, refuse, appeal (fields match API).
- [ ] Push deep link → detail; handle unknown id / 404.
- [ ] Attachment open/preview with auth.
- [ ] Empty / error / offline (optional: read cached list with banner).
- [ ] Analytics: `warning_view`, `warning_ack_submit`, `warning_appeal_submit` (privacy-safe, no PII in event props).

---

## 11) Open decisions (product)

1. **Dedicated `GET /warnings/:warningId`** for staff vs list-only — affects deep link performance.
2. **Whether staff see severity** and full HR notes vs redacted summary — policy/legal.
3. **Appeal window** enforcement: UI-only countdown vs server validation only.
4. **Localization** and tenant-rebrandable strings.

---

*Last aligned with in-repo warning docs and staff strip semantics. Update when API or role matrix changes.*
