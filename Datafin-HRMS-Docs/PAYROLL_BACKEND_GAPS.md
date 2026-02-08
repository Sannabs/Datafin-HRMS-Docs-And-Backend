# Payroll Backend Gaps (UI-First View)

Features or fields that the **frontend payroll UI uses or expects** (with mock data) but are **not yet implemented (or fully aligned) on the backend**. Implement these when wiring the UI to the API.

---

## 1. Allowance Type

| UI has / expects | Backend today | Backend gap |
|------------------|---------------|-------------|
| **defaultAmount** (number, optional) | Not on `AllowanceType` | Add `defaultAmount Float?` to `AllowanceType`. Used as default when adding this type to a structure. |
| **calculationType** (`"fixed"` \| `"percentage"`) | Not on `AllowanceType` | Add `calculationType` (e.g. enum or string) to `AllowanceType`. Backend already has this on **Allowance** (structure row); the type can define the default. |
| **isActive** (boolean, toggle in list) | No `isActive`; uses **deletedAt** for soft delete | Either add `isActive Boolean @default(true)` and keep or drop `deletedAt`, or document that UI maps `isActive = (deletedAt == null)` and API returns accordingly. |
| **No "code" field** in create/edit form | **code** is required on create/update | Make **code** optional, or auto-generate from name (e.g. slug), or add a "Code" field to the UI. |

**Suggested backend changes:** Add `defaultAmount`, `calculationType`, and (if desired) `isActive` to `AllowanceType`. Decide code handling: optional, derived, or required in UI.

---

## 2. Deduction Type

| UI has / expects | Backend today | Backend gap |
|------------------|---------------|-------------|
| **defaultAmount** (number, optional) | Not on `DeductionType` | Add `defaultAmount Float?` to `DeductionType`. |
| **calculationType** (`"fixed"` \| `"percentage"`) | Not on `DeductionType` | Add `calculationType` to `DeductionType`. |
| **isActive** (boolean) | No `isActive`; uses **deletedAt** | Same as AllowanceType: add `isActive` or document mapping from `deletedAt`. |
| **No "code" field** in UI | **code** required | Same as AllowanceType: optional code, auto-generate, or add to UI. |

**Suggested backend changes:** Mirror AllowanceType: add `defaultAmount`, `calculationType`, and optionally `isActive`; resolve code requirement.

---

## 3. Pay Schedule & Pay Period

| UI has / expects | Backend today | Backend gap |
|------------------|---------------|-------------|
| **PayScheduleOption** (id, name, frequency) | No PaySchedule model | Add a **PaySchedule** (or equivalent) entity: e.g. tenantId, name, frequency. |
| **PayPeriod.source** (`"manual"` \| `"schedule"`) | Not on `PayPeriod` | Add `source` (enum or string) to `PayPeriod`. |
| **PayPeriod.scheduleId** / **scheduleName** | Not on `PayPeriod` | Add `scheduleId String?` (FK to PaySchedule) and optionally `scheduleName` for display, or rely on relation. |

**Suggested backend changes:** Introduce PaySchedule; on PayPeriod add `source`, `scheduleId` (optional FK), and optionally `scheduleName`. APIs for pay periods should return schedule info when present so the UI can show "Semi-monthly" etc.

---

## 4. Formula / Conditional at Type Level (Future)

When the UI adds **Formula** and **Conditional** to allowance/deduction **types** (not only to structure rows):

| UI will have | Backend today | Backend gap |
|--------------|---------------|-------------|
| **calculationType** including `"formula"` and `"conditional"` | AllowanceType/DeductionType have no calculationType | Add `calculationType` and, for formula, **defaultFormula String?** on both type models. |
| **Conditional** = amount from rules | Rules already drive amount when structure row is CONDITIONAL | No change if "conditional" is only at row level. If the *type* is marked conditional, backend can treat type as “always use rules” when attached to a structure. |

**Note:** Structure-level **FORMULA** and **formulaExpression** are already implemented on **Allowance** and **Deduction**. This section is only for type-level defaults (e.g. “this allowance type is formula-based with default expression X”).

---

## 5. Salary Structure Response Shape

| UI expects | Backend today | Backend gap |
|------------|---------------|-------------|
| **employeeId** / **employeeName** / **department** / **position** on structure list/detail | Structure has **userId**; API can include `user` with employeeId, name, department, position | None if controllers return `user` (or flattened employeeId, employeeName, etc.) in list/detail. Verify list endpoint returns structures with enough employee info for the UI. |

No schema change needed; ensure API responses match UI types (e.g. `employeeId`, `employeeName` either from `user` or aliased).

---

## 6. Optional: AllowanceType / DeductionType “code” Handling

- **Option A:** Make **code** optional in schema and API; UI keeps only name/description/defaultAmount/calculationType/isActive.
- **Option B:** Keep code required; backend generates it from name (e.g. slug) if not provided.
- **Option C:** Add a **Code** field to the allowance/deduction type UI and send it on create/update.

Pick one so the UI can wire create/edit without extra fields if desired.

---

## Summary Table

| Area | Backend gap (implement when wiring UI) |
|------|----------------------------------------|
| **AllowanceType** | defaultAmount, calculationType, isActive (or deletedAt mapping); code optional/auto/UI |
| **DeductionType** | defaultAmount, calculationType, isActive; code optional/auto/UI |
| **PaySchedule** | New entity (name, frequency, tenantId). |
| **PayPeriod** | source, scheduleId (and optionally scheduleName or relation to PaySchedule). |
| **Type-level formula/conditional** | When UI adds it: calculationType + defaultFormula on types. |
| **Salary structure** | Response shape only; no new fields if API returns employee info. |

All of the above are backend gaps relative to what the payroll UI currently implements or is planned to implement (with mock data).
