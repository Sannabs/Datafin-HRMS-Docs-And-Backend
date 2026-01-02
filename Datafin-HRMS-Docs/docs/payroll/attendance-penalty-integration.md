# Attendance Penalty Integration Guide

## Overview
This utility calculates attendance penalties based on:
- **Absences**: Direct penalty for each absence (no attendance on expected work day)
- **3+ Consecutive Lates**: Penalty for each sequence of 3+ consecutive late days
- **Missing Clock-outs**: Optional penalty for attendance records without clock-out

## Configuration

### Penalty Configuration Object
```javascript
const penaltyConfig = {
  absencePenalty: 100,              // Penalty per absence
  consecutiveLatePenalty: 200,       // Penalty per 3+ consecutive late sequence
  missingClockOutPenalty: 50,        // Penalty per missing clock-out (set 0 to disable)
};
```

### Where to Configure
1. **Hardcoded** (simplest): Define in `processEmployeePayroll` function
2. **Tenant-level**: Store in Tenant model or separate config table
3. **Department-level**: Override tenant defaults per department

## Integration Steps

### Step 1: Import the utility
Add to `services/payroll-run.service.js`:

```javascript
import { calculateAttendancePenalties } from "../utils/attendance-penalty.util.js";
```

### Step 2: Calculate penalties in `processEmployeePayroll`
Add after salary structure is fetched (after line 302) and before `recalculateSalary` call (before line 319):

```javascript
// Calculate attendance penalties
const penaltyConfig = {
  absencePenalty: 100,
  consecutiveLatePenalty: 200,
  missingClockOutPenalty: 50, // Set to 0 to disable
};

let attendancePenaltyData = null;
try {
  attendancePenaltyData = await calculateAttendancePenalties(
    employeeId,
    tenantId,
    payPeriod.startDate,
    payPeriod.endDate,
    penaltyConfig
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
- **Missing Clock-outs**: Optional; disable by setting `missingClockOutPenalty: 0`
- **Error Handling**: Penalties fail gracefully; payroll continues if calculation fails

## Return Value Structure

```javascript
{
  totalPenalty: 350,
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
    missingClockOuts: {
      count: 1,
      penaltyAmount: 50,
    },
  },
}
```

