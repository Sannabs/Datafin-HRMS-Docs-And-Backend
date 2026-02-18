# Attendance Penalty Integration Guide

## Overview
This utility calculates attendance penalties based on:
- **Absences**: Direct penalty for each absence (no attendance on expected work day)
- **3+ Consecutive Lates**: Penalty for each sequence of 3+ consecutive late days

## Configuration

### Penalty Configuration
Penalty amounts are stored in the **Tenant** model:
- `absencePenalty` - Penalty per absence (Float, default: 0)
- `consecutiveLatePenalty` - Penalty per 3+ consecutive late sequence (Float, default: 0)

These values are automatically retrieved from the tenant record and used in calculations.

### Tenant settings UI
Before penalties affect payroll, admins must be able to set these values:

- **Where**: Attendance settings (or Company/Tenant settings), e.g. under the same area as grace period, clock-in methods, etc.
- **Fields to expose**: Absence penalty amount (currency), Consecutive late penalty amount (currency). Optional: help text (e.g. "Per absence" / "Per sequence of 3+ consecutive late days").
- **Backend**: Use the existing tenant PATCH (e.g. `PATCH /api/attendance/config/settings` or tenant update) to persist `absencePenalty` and `consecutiveLatePenalty`.

Until the UI exists, values can be set via database or API; calculations will use whatever is stored on the tenant.

## Integration Steps

### Step 1: Import the utility
Add to `services/payroll-run.service.js`:

```javascript
import { calculateAttendancePenalties } from "../utils/attendance-penalty.util.js";
```

### Step 2: Calculate penalties in `processEmployeePayroll`
Add after salary structure is fetched (after line 302) and before `recalculateSalary` call (before line 319):

```javascript
// Calculate attendance penalties (penalty amounts are automatically retrieved from tenant)
let attendancePenaltyData = null;
try {
  attendancePenaltyData = await calculateAttendancePenalties(
    employeeId,
    tenantId,
    payPeriod.startDate,
    payPeriod.endDate
  );
} catch (penaltyError) {
  logger.error(`Error calculating attendance penalties: ${penaltyError.message}`);
  // Continue without penalty if calculation fails
}
```

### Step 3: Add penalty to total deductions
Modify the deductions calculation section (around line 352-362):

```javascript
let totalDeductions = 0;
for (const deduction of salaryStructure.deductions) {
  const amount = await calculateDeductionAmount(
    deduction,
    grossSalary,
    salaryStructure.baseSalary,
    employeeContext,
    tenantId
  );
  totalDeductions += amount;
}

// Add attendance penalty
if (attendancePenaltyData && attendancePenaltyData.totalPenalty > 0) {
  totalDeductions += attendancePenaltyData.totalPenalty;
  logger.info(`Attendance penalty: ${attendancePenaltyData.totalPenalty} for employee ${employeeId}`);
}
```

### Step 4: Update net salary calculation
Modify the return statement (around line 364-371):

```javascript
return {
  employeeId: employee.id,
  grossSalary,
  totalAllowances,
  totalDeductions,
  netSalary: grossSalary - totalDeductions,
  warnings: warnings?.hasNegativeNetSalary ? warnings : null,
};
```

## Behavior Notes

- **Holidays**: Automatically excluded from expected work days
- **Work Config**: Uses employee's work schedule (Mon-Fri default if not set)
- **Consecutive Lates**: Only sequences of 3+ consecutive days are penalized
- **Absences**: Only expected work days without attendance are penalized
- **Error Handling**: Penalties fail gracefully; payroll continues if calculation fails

## Return Value Structure

```javascript
{
  totalPenalty: 400,
  breakdown: {
    absences: {
      count: 2,
      dates: ['2024-01-15', '2024-01-20'],
      penaltyAmount: 200,
    },
    consecutiveLates: {
      count: 1,
      sequences: [{
        startDate: '2024-01-10',
        endDate: '2024-01-12',
        length: 3,
      }],
      penaltyAmount: 200,
    },
  },
}
```

## Optional: Surface breakdown in UI

To make penalties auditable and visible to HR and employees:

### Payroll run details
- When showing a payroll run (e.g. run summary or per-employee results), include an **attendance penalty** line if `attendancePenaltyData.totalPenalty > 0`.
- Optionally show **breakdown**: e.g. "Absences: 2 days (200)" and "Consecutive lates: 1 sequence (200)" using `attendancePenaltyData.breakdown`. Persist or pass the breakdown from the payroll processing step so the run-details API can return it.

### Payslip views
- Add an **Attendance penalty** deduction line on the payslip when the amount is non-zero.
- Optionally list details: absence dates and/or consecutive-late sequences (from `breakdown`), so employees can see why the deduction was applied.

