# Leave Management Implementation Plan

## Overview

This document outlines the implementation plan for the Leave Management module in Datafin HRMS. The system uses a single annual leave pool with tenant-level policies and employee-specific yearly entitlements.

---

## Database Schema

### Enums

```prisma
enum AccrualMethod {
  FRONT_LOADED    // All days available at year start
  ACCRUAL         // Days accrue over time
}

enum AccrualFrequency {
  MONTHLY
  QUARTERLY
  ANNUALLY
}

enum CarryoverType {
  NONE           // No carryover allowed
  FULL           // Carry all unused balance
  LIMITED        // Carry up to maxCarryoverDays
  ENCASHMENT     // Sell unused days (paid out)
}

enum LeaveRequestStatus {
  PENDING              // Awaiting manager approval
  MANAGER_APPROVED     // Manager approved, awaiting HR
  APPROVED             // Fully approved (HR approved)
  REJECTED             // Rejected by manager or HR
  CANCELLED            // Cancelled by employee
}
```

### Models

#### AnnualLeavePolicy (Tenant-Level)

One policy per tenant. Defines company-wide leave rules.

| Field                 | Type              | Description                          |
| --------------------- | ----------------- | ------------------------------------ |
| id                    | String            | Primary key                          |
| tenantId              | String            | Unique - one policy per tenant       |
| defaultDaysPerYear    | Float             | Default annual allocation (e.g., 20) |
| accrualMethod         | AccrualMethod     | FRONT_LOADED or ACCRUAL              |
| accrualFrequency      | AccrualFrequency? | MONTHLY, QUARTERLY, ANNUALLY         |
| accrualDaysPerPeriod  | Float?            | Days per accrual period              |
| carryoverType         | CarryoverType     | NONE, FULL, LIMITED, ENCASHMENT      |
| maxCarryoverDays      | Float?            | Max days if LIMITED                  |
| carryoverExpiryMonths | Int?              | Months until carryover expires       |
| encashmentRate        | Float?            | Rate per day for ENCASHMENT          |
| advanceNoticeDays     | Int               | Minimum notice for requests          |

#### LeaveType (Categories)

Leave categories for tracking and reporting.

**Note:** All leave types require approval (two-tier: Manager → HR). No `requiresApproval` field needed.

| Field             | Type    | Description                        |
| ----------------- | ------- | ---------------------------------- |
| id                | String  | Primary key                        |
| tenantId          | String  | Tenant reference                   |
| name              | String  | e.g., "Annual Leave", "Sick Leave" |
| description       | String? | Optional description               |
| color             | String? | Hex color for calendar             |
| isPaid            | Boolean | Paid vs unpaid leave               |
| deductsFromAnnual | Boolean | Does this deduct from annual pool? |
| requiresDocument  | Boolean | e.g., medical certificate          |
| isActive          | Boolean | Active status                      |

#### YearlyEntitlement (Employee Balance)

Per employee per year balance tracking.

| Field               | Type      | Description                              |
| ------------------- | --------- | ---------------------------------------- |
| id                  | String    | Primary key                              |
| tenantId            | String    | Tenant reference                         |
| userId              | String    | Employee reference                       |
| policyId            | String    | Policy reference                         |
| year                | Int       | Calendar year (e.g., 2025)               |
| allocatedDays       | Float     | Days allocated (from policy or override) |
| accruedDays         | Float     | Days accrued so far (if accrual method)  |
| carriedOverDays     | Float     | Days carried from previous year          |
| adjustmentDays      | Float     | Manual adjustments (+/-)                 |
| usedDays            | Float     | Days used (approved leaves)              |
| pendingDays         | Float     | Days in pending requests                 |
| encashedDays        | Float     | Days sold (if encashment)                |
| encashmentAmount    | Float     | Amount paid for encashed days            |
| yearStartDate       | DateTime  | Start of leave year                      |
| yearEndDate         | DateTime  | End of leave year                        |
| lastAccrualDate     | DateTime? | Last accrual processing date             |
| carryoverExpiryDate | DateTime? | When carryover expires                   |

**Note:** `notes` field removed - not needed for balance tracking.

#### LeaveRequest (Two-Tier Approval)

Leave requests with manager → HR approval flow.

| Field             | Type               | Description                |
| ----------------- | ------------------ | -------------------------- |
| id                | String             | Primary key                |
| tenantId          | String             | Tenant reference           |
| userId            | String             | Employee reference         |
| leaveTypeId       | String             | Leave type reference       |
| startDate         | Date               | Leave start date           |
| endDate           | Date               | Leave end date             |
| totalDays         | Float              | Calculated working days    |
| reason            | String?            | Leave reason               |
| attachments       | String[]           | Document URLs              |
| status            | LeaveRequestStatus | Current status             |
| managerId         | String?            | Manager who approved       |
| managerApprovedAt | DateTime?          | Manager approval timestamp |
| hrId              | String?            | HR who approved            |
| hrApprovedAt      | DateTime?          | HR approval timestamp      |
| rejectedBy        | String?            | Who rejected               |
| rejectedAt        | DateTime?          | Rejection timestamp        |
| rejectionReason   | String?            | Rejection reason           |
| cancelledAt       | DateTime?          | Cancellation timestamp     |

#### Leave End Notifications

Instead of storing `daysLeft` (which would require daily updates), query based on `endDate`:

```javascript
// Find approved leaves ending soon (for notifications)
const leavesEndingTomorrow = await prisma.leaveRequest.findMany({
  where: {
    status: "APPROVED",
    endDate: tomorrow, // or use range for "ending in 1-3 days"
  },
});
```

This approach is more reliable as it doesn't require maintaining derived state.

---

## Balance Calculation

### Available Balance Formula

```
Available = allocatedDays + accruedDays + carriedOverDays + adjustmentDays - usedDays - pendingDays
```

### Balance Components

| Component       | Description                 | When Updated                                   |
| --------------- | --------------------------- | ---------------------------------------------- |
| allocatedDays   | Base allocation from policy | Year start (FRONT_LOADED) or stays 0 (ACCRUAL) |
| accruedDays     | Earned over time            | Monthly/Quarterly (if ACCRUAL method)          |
| carriedOverDays | From previous year          | Year start initialization                      |
| adjustmentDays  | Manual HR adjustments       | When HR adjusts balance                        |
| usedDays        | Approved leave days         | When leave is approved                         |
| pendingDays     | In pending requests         | When request submitted/resolved                |

### Accrual Method Impact on Balance Fields

**FRONT_LOADED Method:**

- `allocatedDays` = Full amount (e.g., 21 days) loaded at year start
- `accruedDays` = 0 (stays 0, not used)
- Available = `allocatedDays + 0 + carriedOverDays + adjustmentDays - usedDays - pendingDays`

**ACCRUAL Method:**

- `allocatedDays` = 0 (stays 0, not used)
- `accruedDays` = Starts at 0, increases monthly/quarterly (updated by scheduled job)
- Available = `0 + accruedDays + carriedOverDays + adjustmentDays - usedDays - pendingDays`

**Note:** Available balance is **calculated on-the-fly**, not stored. The `YearlyEntitlement` model stores the components, and available balance is computed when needed.

### Balance Example

```
Employee: John Doe
Year: 2025
Policy: 20 days/year, FRONT_LOADED, LIMITED carryover (max 5 days)

Previous Year (2024):
- allocatedDays: 20
- usedDays: 15
- Unused: 5 days

Current Year (2025):
- allocatedDays: 20 (from policy)
- carriedOverDays: 5 (from 2024, within limit)
- usedDays: 0
- pendingDays: 0

Available = 20 + 0 + 5 + 0 - 0 - 0 = 25 days
```

---

## Carryover Logic

### Carryover Types

| Type       | Description      | Calculation                                             |
| ---------- | ---------------- | ------------------------------------------------------- |
| NONE       | No carryover     | carriedOverDays = 0                                     |
| FULL       | Carry all unused | carriedOverDays = all unused from previous year         |
| LIMITED    | Carry up to max  | carriedOverDays = min(unused, maxCarryoverDays)         |
| ENCASHMENT | Sell unused days | encashedDays = unused, encashmentAmount = unused × rate |

### Carryover Flow

```
┌─────────────────────────────────────┐
│ Year End (Dec 31)                   │
│ or Year Start (Jan 1)               │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Get Previous Year Entitlement       │
│ Calculate Unused Days:              │
│ unused = allocated + accrued +      │
│          carried + adjustment -     │
│          used - encashed            │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Apply Carryover Policy              │
└─────────────────────────────────────┘
              │
    ┌─────────┼─────────┬─────────┐
    │         │         │         │
    ▼         ▼         ▼         ▼
  NONE      FULL    LIMITED  ENCASHMENT
    │         │         │         │
    ▼         ▼         ▼         ▼
carry=0   carry=all  carry=    encash=
                     min(unused, unused
                     max)
              │
              ▼
┌─────────────────────────────────────┐
│ Create New Year Entitlement         │
│ - carriedOverDays = calculated      │
│ - Calculate carryoverExpiryDate     │
│ - allocatedDays = policy default    │
│   (if FRONT_LOADED)                 │
└─────────────────────────────────────┘
```

### Carryover Expiry

If `carryoverExpiryMonths` is set (e.g., 3), carryover must be used by that month:

- Carryover in January 2025
- Expiry: March 31, 2025
- If not used by expiry, those days are forfeited

---

## Accrual Logic

### Accrual Methods

| Method       | Description                      |
| ------------ | -------------------------------- |
| FRONT_LOADED | All days available at year start |
| ACCRUAL      | Days earned over time            |

### Accrual Frequencies

| Frequency | Calculation               | Example (20 days/year)        |
| --------- | ------------------------- | ----------------------------- |
| MONTHLY   | 20 ÷ 12 = 1.67 days/month | Jan: 1.67, Feb: 3.34, ...     |
| QUARTERLY | 20 ÷ 4 = 5 days/quarter   | Q1: 5, Q2: 10, Q3: 15, Q4: 20 |
| ANNUALLY  | All at once               | Jan 1: 20 days                |

### Accrual Flow

```
┌─────────────────────────────────────┐
│ Scheduled Job (1st of month)        │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ For each tenant with ACCRUAL policy │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ For each employee entitlement:      │
│ 1. Check lastAccrualDate            │
│ 2. Calculate periods since last     │
│ 3. Calculate days to accrue         │
│ 4. Cap at maxDaysPerYear            │
│ 5. Update accruedDays               │
│ 6. Update lastAccrualDate           │
└─────────────────────────────────────┘
```

### Accrual Example

```
Policy: 20 days/year, ACCRUAL, MONTHLY
accrualDaysPerPeriod: 1.67 (20 ÷ 12)

January 1:  accruedDays = 0
February 1: accruedDays = 1.67
March 1:    accruedDays = 3.34
April 1:    accruedDays = 5.01
...
December 1: accruedDays = 18.37
January 1:  accruedDays = 20.00 (capped)
```

---

## Leave Request Flow

### Two-Tier Approval Flow

```
┌─────────────────────────────────────┐
│ Employee Submits Leave Request      │
│ status = PENDING                    │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Validation:                         │
│ 1. Check dates (start <= end)       │
│ 2. Calculate working days           │
│ 3. Check for overlapping requests   │
│ 4. If deductsFromAnnual:            │
│    - Check available balance        │
│ 5. Check advance notice (if req)    │
└─────────────────────────────────────┘
              │
         Valid? ─────No────► Return Error
              │
             Yes
              │
              ▼
┌─────────────────────────────────────┐
│ Create Request:                     │
│ - status = PENDING                  │
│ - If deductsFromAnnual:             │
│   entitlement.pendingDays += days   │
│ - Send notification to Manager      │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Manager Reviews                     │
└─────────────────────────────────────┘
              │
        ┌─────┴─────┐
        │           │
    Approve      Reject
        │           │
        ▼           ▼
┌──────────────┐ ┌──────────────┐
│ status =     │ │ status =     │
│ MANAGER_     │ │ REJECTED     │
│ APPROVED     │ │ Restore      │
│              │ │ pendingDays  │
│ managerId =  │ │              │
│ manager      │ │ rejectedBy = │
│ managerAppr- │ │ manager      │
│ ovedAt = now │ │ rejectedAt = │
│              │ │ now          │
│ Notify HR    │ │ Notify       │
└──────────────┘ │ Employee     │
        │        └──────────────┘
        ▼
┌─────────────────────────────────────┐
│ HR Reviews                          │
└─────────────────────────────────────┘
              │
        ┌─────┴─────┐
        │           │
    Approve      Reject
        │           │
        ▼           ▼
┌──────────────┐ ┌──────────────┐
│ status =     │ │ status =     │
│ APPROVED     │ │ REJECTED     │
│              │ │ Restore      │
│ hrId = hr    │ │ pendingDays  │
│ hrApprovedAt │ │              │
│ = now        │ │ rejectedBy = │
│              │ │ hr           │
│ If deducts:  │ │ rejectedAt = │
│ pendingDays  │ │ now          │
│ -= days      │ │              │
│ usedDays +=  │ │ Notify       │
│ days         │ │ Employee     │
│              │ └──────────────┘
│ Mark attend- │
│ ance ON_LEAVE│
│              │
│ Notify       │
│ Employee     │
└──────────────┘
```

### Cancellation Flow

```
┌─────────────────────────────────────┐
│ Employee Requests Cancellation      │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Check Current Status                │
└─────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
  PENDING/           APPROVED
  MANAGER_APPROVED      │
    │                   │
    ▼                   ▼
┌──────────────┐ ┌──────────────┐
│ Can cancel   │ │ Check if     │
│ directly     │ │ leave started│
│              │ │              │
│ pendingDays  │ │ If future:   │
│ -= days      │ │ Can cancel,  │
│              │ │ usedDays -=  │
│ status =     │ │ days         │
│ CANCELLED    │ │              │
│              │ │ If started:  │
│ cancelledAt  │ │ Cannot       │
│ = now        │ │ cancel       │
└──────────────┘ └──────────────┘
```

---

## Entitlement Initialization

### When to Initialize

| Trigger             | Description                                        | Implementation                         | Type            |
| ------------------- | -------------------------------------------------- | -------------------------------------- | --------------- |
| **Invite Accepted** | Employee accepts invitation and account is created | Automatic - created immediately        | Proactive       |
| **First Access**    | Employee checks balance or submits leave request   | Automatic - lazy initialization        | Lazy (fallback) |
| **Year-End**        | New year starts for all existing employees         | Scheduled job (Jan 1st) - batch create | Batch           |
| **Manual**          | HR manually initializes for edge cases             | Admin endpoint                         | Manual          |

**Important Notes:**

- **Signup:** Entitlements are **NOT created on company signup** (admin can configure policy first)
- **Invite Acceptance:** Entitlements **ARE created immediately** when employee accepts invitation (proactive)
- **First Access:** If employee accesses leave features before accepting invite, entitlement created then (lazy fallback)

### Initialization Flow (Lazy - First Access)

```
┌─────────────────────────────────────┐
│ Employee Accesses Leave Feature     │
│ (Check balance / Submit request)    │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ getOrCreateEntitlement()            │
│ - Check if entitlement exists       │
└─────────────────────────────────────┘
              │
         Exists?
              │
    ┌─────────┴─────────┐
   Yes                  No
    │                    │
    ▼                    ▼
┌──────────────┐  ┌──────────────┐
│ Return       │  │ Create       │
│ existing     │  │ entitlement: │
│ entitlement  │  │              │
└──────────────┘  │ - Get policy │
                  │ - Calculate  │
                  │   pro-rata   │
                  │   if mid-year│
                  │ - Set        │
                  │   allocated/ │
                  │   accrued    │
                  │   based on   │
                  │   method     │
                  │ - Create     │
                  └──────────────┘
```

### Initialization on Invite Acceptance (Proactive)

When employee accepts invitation:

```
┌─────────────────────────────────────┐
│ Employee Accepts Invitation         │
│ (Creates User record)               │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ Call getOrCreateEntitlement()       │
│ - Check if entitlement exists       │
│ - If NO: Create immediately         │
│   - Get policy                      │
│   - Calculate pro-rata if mid-year  │
│   - Set allocatedDays/accruedDays  │
│     based on accrual method         │
│   - Create entitlement              │
└─────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────┐
│ ✅ Entitlement Created              │
│ Employee ready to use leave system  │
└─────────────────────────────────────┘
```

**Key Point:** For normal employees, entitlement is created **immediately** on invite acceptance (proactive), not lazily. This ensures they have a balance from day one.

### Pro-Rata Calculation (Mid-Year Joins)

For employees joining mid-year with FRONT_LOADED policy:

```
Full Year Days = policy.defaultDaysPerYear (e.g., 20)
Months Remaining = 12 - current month + 1
Pro-Rata Days = (Full Year Days / 12) × Months Remaining

Example: Join July 1 (month 7)
- Months Remaining: 12 - 7 + 1 = 6 months
- Pro-Rata Days: (20 / 12) × 6 = 10 days
```

---

## Policy Update Behavior

### Default Behavior: Changes Affect New Entitlements Only

When HR updates the leave policy:

- **Existing entitlements:** Remain **UNCHANGED** (data integrity, fairness)
- **New entitlements:** Use new policy settings (new employees, new year)
- **Next year:** All employees get new policy settings

### Why This Approach?

1. **Data Integrity:** Historical entitlements shouldn't change retroactively
2. **Fairness:** Employees already allocated leave under old policy
3. **Simplicity:** One clear rule, no complex recalculation logic
4. **Best Practice:** HR should configure policy before bulk employee invites

### What Policy Changes Affect

| Policy Change        | Affects                  | Does NOT Affect           |
| -------------------- | ------------------------ | ------------------------- |
| `defaultDaysPerYear` | New entitlements only    | Existing entitlements     |
| `accrualMethod`      | New entitlements only    | Current year entitlements |
| `accrualFrequency`   | New entitlements only    | Current year entitlements |
| `carryoverType`      | Year-end processing only | Already carried amounts   |
| `maxCarryoverDays`   | Future carryovers only   | Already carried amounts   |

### Example: Policy Update Mid-Year

```
Initial State (Jan 1, 2025):
- Policy: 20 days/year, FRONT_LOADED
- Employee A: allocatedDays = 20, accruedDays = 0
- Employee B: allocatedDays = 20, accruedDays = 0

HR Updates Policy (March 1, 2025):
- New Policy: 25 days/year, ACCRUAL, MONTHLY

Result:
- Employee A: allocatedDays = 20, accruedDays = 0 (UNCHANGED)
- Employee B: allocatedDays = 20, accruedDays = 0 (UNCHANGED)
- New Employee C (invited after update): allocatedDays = 0, accruedDays = 0 (will accrue monthly)
- Next Year (2026): All employees get 25 days with ACCRUAL method
```

### Manual Adjustment for Edge Cases

If HR needs to fix existing entitlements:

- Use manual adjustment endpoint: `POST /api/v1/leave/balance/:userId/adjust`
- Adjust individual employee balances as needed
- This is a business process issue, not a software automation issue

---

## Scenarios

### Scenario 1: New Employee Onboarding (Lazy Initialization)

**Context:** Employee accepts invitation on July 1, 2025
**Policy:** 20 days/year, FRONT_LOADED

```
Step 1: HR sends invitation to employee
Step 2: Employee accepts invitation
Step 3: User record created
Step 4: getOrCreateEntitlement() called (lazy initialization)
Step 5: System creates YearlyEntitlement:
        - year: 2025
        - allocatedDays: 10 (pro-rata: 6 months remaining)
        - accruedDays: 0 (FRONT_LOADED method)
        - carriedOverDays: 0 (new employee)
        - yearStartDate: 2025-07-01 (join date)
        - yearEndDate: 2025-12-31
        - Available: 10 days
```

**Alternative:** If employee first accesses leave feature (check balance) before accepting invite, entitlement is created at that point.

### Scenario 1b: Company Signup (No Entitlement Created)

**Context:** Company signs up, admin account created
**Policy:** Default policy created (21 days/year, FRONT_LOADED)

```
Step 1: Company signs up
Step 2: Tenant created
Step 3: Default shift created
Step 4: User (admin) created
Step 5: Default policy created
Step 6: ❌ NO entitlement created for admin

Result:
- Admin can configure policy settings
- Admin entitlement created lazily when:
  - Admin checks balance, OR
  - Admin submits first leave request, OR
  - Admin accepts invitation (if self-invited)
```

**Why:** Admin typically configures policy first, then uses leave features later. Lazy initialization avoids unnecessary creation.

### Scenario 2: Year-End Carryover (LIMITED)

**Context:** Year end 2024 → 2025
**Policy:** Carryover LIMITED, max 5 days

```
2024 Entitlement:
- allocatedDays: 20
- usedDays: 12
- Unused: 8 days

Year-End Processing:
- carryoverType: LIMITED
- maxCarryoverDays: 5
- carriedOver: min(8, 5) = 5 days
- Forfeited: 3 days

2025 Entitlement Created:
- allocatedDays: 20
- carriedOverDays: 5
- Available: 25 days
```

### Scenario 3: Year-End Encashment

**Context:** Year end 2024 → 2025
**Policy:** Carryover ENCASHMENT, rate $100/day

```
2024 Entitlement:
- allocatedDays: 20
- usedDays: 15
- Unused: 5 days

Year-End Processing:
- carryoverType: ENCASHMENT
- encashmentRate: 100
- encashedDays: 5
- encashmentAmount: 5 × 100 = $500

2025 Entitlement Created:
- allocatedDays: 20
- carriedOverDays: 0 (all encashed)
- Available: 20 days

Payroll Integration:
- Add $500 encashment to next payroll
```

### Scenario 4: Monthly Accrual (ACCRUAL Method)

**Context:** New year starts, ACCRUAL method
**Policy:** 20 days/year, ACCRUAL, MONTHLY (1.67 days/month)

**Key Point:** With ACCRUAL method, `allocatedDays` stays 0, only `accruedDays` increases.

```
January 1, 2025 (Entitlement Created):
- allocatedDays: 0 (ACCRUAL method - not used)
- accruedDays: 0
- Available: 0 days

February 1, 2025 (Accrual Job Runs):
- allocatedDays: 0 (unchanged)
- accruedDays: 0 → 1.67
- Available: 1.67 days

March 1, 2025 (Accrual Job Runs):
- allocatedDays: 0 (unchanged)
- accruedDays: 1.67 → 3.34
- Available: 3.34 days

Employee Requests 2 Days (March 15):
- Available: 3.34 days (from accruedDays)
- Requested: 2 days
- Balance Check: 2 <= 3.34 ✓ Allowed
```

**Comparison with FRONT_LOADED:**

- FRONT_LOADED: `allocatedDays = 20`, `accruedDays = 0` (all available immediately)
- ACCRUAL: `allocatedDays = 0`, `accruedDays` grows monthly (earned over time)

### Scenario 5: Leave Request Approval Flow

**Context:** Employee requests 5 days annual leave

```
Step 1: Employee submits request
        - startDate: 2025-02-10
        - endDate: 2025-02-14
        - totalDays: 5 (working days calculated)
        - leaveType: Annual Leave (deductsFromAnnual: true)

        Balance Check:
        - Available: 25 days
        - Requested: 5 days
        - 5 <= 25 ✓ Sufficient

        Update Entitlement:
        - pendingDays: 0 → 5

        Request Created:
        - status: PENDING

Step 2: Manager approves
        - status: PENDING → MANAGER_APPROVED
        - managerId: [manager's ID]
        - managerApprovedAt: [timestamp]
        - Notification sent to HR

Step 3: HR approves
        - status: MANAGER_APPROVED → APPROVED
        - hrId: [HR's ID]
        - hrApprovedAt: [timestamp]

        Update Entitlement:
        - pendingDays: 5 → 0
        - usedDays: 0 → 5
        - New Available: 25 - 5 = 20 days

        Notification sent to Employee
```

### Scenario 6: Leave Request Rejection

**Context:** Manager rejects leave request

```
Initial State:
- Request status: PENDING
- pendingDays: 5

Manager Rejects:
- status: PENDING → REJECTED
- rejectedBy: [manager's ID]
- rejectedAt: [timestamp]
- rejectionReason: "Critical project deadline"

Update Entitlement:
- pendingDays: 5 → 0 (restored)

Notification sent to Employee with reason
```

### Scenario 7: Carryover Expiry

**Context:** Carryover expires in March
**Policy:** carryoverExpiryMonths: 3

```
January 1, 2025:
- allocatedDays: 20
- carriedOverDays: 5
- carryoverExpiryDate: 2025-03-31
- Available: 25 days

Employee uses 3 days in February:
- usedDays: 3
- Available: 22 days

April 1, 2025 (Expiry Check Job):
- Carryover expired on March 31
- Remaining carryover: 5 - 3 = 2 days unused
- Forfeit 2 days:
  - carriedOverDays: 5 → 3 (only used portion counts)
  - Or adjustment: adjustmentDays: -2

- Available: 20 - 3 = 17 days (only allocated minus used)
```

### Scenario 8: Study Leave (Non-Deducting)

**Context:** Employee requests study leave
**LeaveType:** Study Leave (deductsFromAnnual: false)

```
Step 1: Employee submits request
        - leaveType: Study Leave
        - totalDays: 10

        Balance Check:
        - deductsFromAnnual: false
        - Skip balance check ✓

        Request Created:
        - status: PENDING
        - pendingDays NOT updated (doesn't deduct)

Step 2: Manager approves
        - status: MANAGER_APPROVED

Step 3: HR approves
        - status: APPROVED
        - usedDays NOT updated (doesn't deduct)
        - Annual balance unchanged

        Attendance marked as ON_LEAVE
```

### Scenario 9: Manual Balance Adjustment

**Context:** HR needs to add 2 extra days for employee

```
Before:
- allocatedDays: 20
- adjustmentDays: 0
- Available: 20

HR Adjustment:
- Reason: "Performance bonus - 2 extra leave days"
- adjustmentDays: 0 → 2

After:
- allocatedDays: 20
- adjustmentDays: 2
- Available: 22 days

Audit Log:
- Action: ADJUST_BALANCE
- Changes: { adjustmentDays: { before: 0, after: 2 } }
- Reason: "Performance bonus - 2 extra leave days"
```

---

## API Endpoints

### Leave Policy

| Method | Endpoint               | Description               | Access   |
| ------ | ---------------------- | ------------------------- | -------- |
| GET    | `/api/v1/leave/policy` | Get tenant's leave policy | All      |
| POST   | `/api/v1/leave/policy` | Create leave policy       | HR_ADMIN |
| PATCH  | `/api/v1/leave/policy` | Update leave policy       | HR_ADMIN |

### Leave Types

| Method | Endpoint                  | Description            | Access   |
| ------ | ------------------------- | ---------------------- | -------- |
| GET    | `/api/v1/leave/types`     | List all leave types   | All      |
| POST   | `/api/v1/leave/types`     | Create leave type      | HR_ADMIN |
| PATCH  | `/api/v1/leave/types/:id` | Update leave type      | HR_ADMIN |
| DELETE | `/api/v1/leave/types/:id` | Soft delete leave type | HR_ADMIN |

### Leave Requests

| Method | Endpoint                                     | Description             | Access             |
| ------ | -------------------------------------------- | ----------------------- | ------------------ |
| GET    | `/api/v1/leave/requests`                     | List requests (filters) | All                |
| GET    | `/api/v1/leave/requests/my`                  | Get my requests         | Employee           |
| GET    | `/api/v1/leave/requests/pending`             | Pending for approval    | Manager/HR         |
| POST   | `/api/v1/leave/requests`                     | Submit request          | Employee           |
| GET    | `/api/v1/leave/requests/:id`                 | Get request details     | All                |
| POST   | `/api/v1/leave/requests/:id/manager-approve` | Manager approve         | DEPARTMENT_ADMIN   |
| POST   | `/api/v1/leave/requests/:id/hr-approve`      | HR approve              | HR_ADMIN, HR_STAFF |
| POST   | `/api/v1/leave/requests/:id/reject`          | Reject request          | Manager/HR         |
| POST   | `/api/v1/leave/requests/:id/cancel`          | Cancel request          | Employee           |

### Leave Balances

| Method | Endpoint                                   | Description            | Access   |
| ------ | ------------------------------------------ | ---------------------- | -------- |
| GET    | `/api/v1/leave/balance`                    | Get my balance         | Employee |
| GET    | `/api/v1/leave/balance/:userId`            | Get employee balance   | HR       |
| GET    | `/api/v1/leave/balances`                   | List all balances      | HR_ADMIN |
| POST   | `/api/v1/leave/balance/:userId/adjust`     | Manual adjustment      | HR_ADMIN |
| POST   | `/api/v1/leave/balance/:userId/initialize` | Initialize entitlement | HR_ADMIN |

### Admin Operations

| Method | Endpoint                                       | Description           | Access   |
| ------ | ---------------------------------------------- | --------------------- | -------- |
| POST   | `/api/v1/leave/admin/initialize-year`          | Batch initialize year | HR_ADMIN |
| POST   | `/api/v1/leave/admin/process-accruals`         | Manual accrual run    | HR_ADMIN |
| POST   | `/api/v1/leave/admin/process-encashment`       | Process encashment    | HR_ADMIN |
| POST   | `/api/v1/leave/admin/process-carryover-expiry` | Expire old carryover  | HR_ADMIN |

---

## Scheduled Jobs

| Job                       | Schedule                   | Description                              |
| ------------------------- | -------------------------- | ---------------------------------------- |
| Leave Accrual             | 1st of each month, 1:00 AM | Process monthly/quarterly accruals       |
| Year-End Processing       | Jan 1st, 00:05 AM          | Initialize new year entitlements (batch) |
| Carryover Expiry Check    | 1st of each month, 2:00 AM | Forfeit expired carryover                |
| Leave Ending Notification | Daily, 8:00 AM             | Notify employees whose leave ends soon   |

### Note on Entitlement Initialization

- **Signup:** No entitlement created for admin (lazy initialization when needed)
- **Invite Acceptance:** Entitlement created **immediately** when employee accepts invitation (proactive)
- **First Access (Fallback):** If employee accesses leave features before invite acceptance, entitlement created then (lazy)
- **Existing employees (new year):** Initialized via Year-End Processing job (batch)
- **Manual:** HR can initialize via admin endpoint for edge cases

---

## Files to Create

### Controllers

- `controllers/leave.controller.js` (single file with all leave controllers)

### Services

- `services/leave-entitlement.service.js`
- `services/leave-accrual.service.js`
- `services/leave-request.service.js`

### Routes

- `routes/leave.route.js`

### Automations

- `automations/leave-accrual.job.js`
- `automations/leave-year-end.job.js`

### Utils

- `utils/leave.utils.js` (working days calculation)

---

## Implementation Phases

### Phase 1: Schema & Models

1. Add enums to schema
2. Create AnnualLeavePolicy model
3. Create LeaveType model
4. Create YearlyEntitlement model
5. Create LeaveRequest model
6. Update Tenant and User models
7. Run migration

### Phase 2: Policy & Types

1. Create leave-policy controller/routes
2. Create leave-type controller/routes
3. CRUD operations for policies and types

### Phase 3: Entitlements & Balances

1. Create leave-entitlement service
2. Create leave-balance controller/routes
3. Initialize entitlement logic (single employee)
4. Balance calculation logic
5. Manual adjustment endpoint
6. **Integrate with invitation acceptance flow** (update `invitations.controller.js`)

### Phase 4: Leave Requests

1. Create leave-request service
2. Create leave-request controller/routes
3. Submit request with validation
4. Two-tier approval flow
5. Rejection and cancellation

### Phase 5: Automation

1. Create year-end processing job (batch initialize for all employees)
2. Create accrual job (if ACCRUAL method)
3. Create carryover expiry job
4. Create leave-ending notification job
5. Notification integration

### Phase 6: Testing & Refinement

1. Unit tests for calculations
2. Integration tests for flows
3. Edge case handling
4. Performance optimization

---

## Integration Points

### Invitation Module (Employee Onboarding)

- **Trigger:** When employee accepts invitation
- **Action:** Initialize YearlyEntitlement for current year
- **Location:** Update `invitations.controller.js` (accept invite handler)
- **Logic:** Call `initializeYearlyEntitlement(userId, tenantId)` after user creation

### Attendance Module

- Mark attendance as `ON_LEAVE` for approved leave dates
- Exclude leave days from attendance calculations

### Payroll Module

- Encashment amount added to payroll
- Unpaid leave deductions (if applicable)

### Notification Module

- Request submitted notifications
- Approval/rejection notifications
- Balance warnings
- Accrual notifications
- Leave ending soon notifications

### Audit Module

- Log all leave-related actions
- Track balance changes
- Track request status changes

---

## Key Design Decisions Summary

### 1. Entitlement Initialization: Hybrid Approach

**Decision:**

- **Signup:** No entitlement created (admin configures policy first)
- **Invite Acceptance:** Entitlement created **immediately** (proactive for employees)
- **First Access:** Lazy fallback if needed

**Why:**

- Admin configures policy first, then uses leave features (lazy for admin)
- Employees get balance immediately on onboarding (proactive for employees)
- Consistent behavior using same `getOrCreateEntitlement()` function
- Simple, one code path

**When Created:**

- **Proactive:** Immediately when employee accepts invitation
- **Lazy (Fallback):** First balance check or leave request (if somehow missed on invite acceptance)
- **Lazy (Admin):** When admin first accesses leave features

### 2. Policy Updates: New Entitlements Only

**Decision:** Policy changes affect new entitlements only, existing entitlements remain unchanged.

**Why:**

- Data integrity (historical records shouldn't change)
- Fairness (employees already allocated under old policy)
- Simplicity (one clear rule)
- Best practice (configure before bulk invites)

**Manual Adjustment:** HR can manually adjust individual balances if needed via admin endpoint.

### 3. Accrual Method Impact

**FRONT_LOADED:**

- `allocatedDays` = full amount at year start
- `accruedDays` = 0 (not used)
- All days available immediately

**ACCRUAL:**

- `allocatedDays` = 0 (not used)
- `accruedDays` = grows over time (monthly/quarterly)
- Days earned gradually

**Available Balance:** Always calculated as `allocatedDays + accruedDays + carriedOverDays + adjustmentDays - usedDays - pendingDays`

### 4. Balance Tracking

**Not Stored:** Available balance is calculated on-the-fly, not stored in database.

**Stored Components:** `allocatedDays`, `accruedDays`, `carriedOverDays`, `adjustmentDays`, `usedDays`, `pendingDays` in `YearlyEntitlement` model.

**Why:** Single source of truth, always accurate, no sync issues.
