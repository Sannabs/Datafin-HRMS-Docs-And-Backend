# Payroll Setup Checklist - HR Admin Guide

## Overview
This document outlines the **required setup order** for HR Admin to configure the payroll system. Items must be completed in the specified sequence due to system dependencies.

---

## Critical Path: Required Setup Order

### ✅ Phase 1: Foundation Setup (REQUIRED FIRST)

These are the **absolute minimum** requirements before any payroll can be processed.

#### 1.1 Allowance Types (If Using Allowances)
**Priority:** HIGH (if allowances will be used)  
**Time:** 5-10 minutes  
**Dependency:** None

**What to Set Up:**
- Create allowance types that will be used in employee salary structures
- Examples: Transportation, Housing, Meal Allowance, etc.

**Required Information:**
- Name (e.g., "Transportation Allowance")
- Code (e.g., "TRANS") - must be unique
- Taxable Status (Yes/No)

**Minimum Required:**
- At least one allowance type if you plan to use allowances
- Can be skipped if no employees will have allowances

**Where:** `/payroll/setup/allowance-types`

---

#### 1.2 Deduction Types (If Using Deductions)
**Priority:** HIGH (if deductions will be used)  
**Time:** 5-10 minutes  
**Dependency:** None

**What to Set Up:**
- Create deduction types that will be used in employee salary structures
- Examples: Income Tax, Social Security, Health Insurance, etc.

**Required Information:**
- Name (e.g., "Income Tax")
- Code (e.g., "TAX") - must be unique
- Statutory Status (Yes/No)

**Minimum Required:**
- At least one deduction type if you plan to use deductions
- **Note:** Most organizations will need at least statutory deductions (tax, social security)

**Where:** `/payroll/setup/deduction-types`

---

### ✅ Phase 2: Employee Salary Structures (REQUIRED)

**Priority:** CRITICAL - Cannot process payroll without this  
**Time:** 5-15 minutes per employee  
**Dependency:** Phase 1 (if using allowances/deductions)

#### 2.1 Create Salary Structure for Each Employee
**What to Set Up:**
- Base salary for each employee
- Optional: Add allowances (requires Phase 1.1)
- Optional: Add deductions (requires Phase 1.2)

**Required Information:**
- Employee (must exist in system)
- Base Salary (required)
- Effective Date (required)
- End Date (optional)
- Currency (defaults to USD)
- Allowances (optional, but requires allowance types to exist)
- Deductions (optional, but requires deduction types to exist)

**Minimum Required:**
- **At least one employee with an active salary structure** (with base salary at minimum)
- Allowances and deductions are optional, but base salary is mandatory

**Where:** `/payroll/setup/salary-structures/employees/[employeeId]/new`

**Important Notes:**
- You can create a salary structure with **only base salary** (no allowances/deductions)
- If you want to add allowances later, you must first create the allowance types
- If you want to add deductions later, you must first create the deduction types
- Each employee needs at least one active salary structure to be included in payroll runs

---

### ✅ Phase 3: Pay Period Creation (REQUIRED)

**Priority:** CRITICAL - Cannot process payroll without this  
**Time:** 2-5 minutes  
**Dependency:** None (can be done in parallel with Phase 2)

#### 3.1 Create Pay Period
**What to Set Up:**
- Define the time period for payroll processing
- Typically one per calendar month

**Required Information:**
- Period Name (e.g., "January 2025")
- Start Date
- End Date

**Minimum Required:**
- **At least one pay period** in DRAFT or PROCESSING status

**Where:** `/payroll/pay-periods/new`

**Important Notes:**
- Can be created in advance
- System validates no overlapping periods
- Status must be DRAFT or PROCESSING to start a payroll run

---

### ✅ Phase 4: Process Payroll (READY TO RUN)

**Priority:** Operational  
**Time:** Varies (depends on employee count)  
**Dependency:** Phase 2 + Phase 3

#### 4.1 Create and Start Payroll Run
**What to Do:**
- Select pay period
- Select employees (or process all)
- Review and confirm
- Start processing

**Minimum Required:**
- Pay period exists (Phase 3)
- At least one employee with active salary structure (Phase 2)

**Where:** `/payroll/payroll-runs/new`

---

## Setup Priority Summary

### 🔴 CRITICAL (Must Complete Before First Payroll)

1. **✅ Create Pay Period** (Phase 3)
   - **Why:** Payroll runs require a pay period
   - **Time:** 2-5 minutes
   - **Can be done:** Anytime, even in advance

2. **✅ Create Salary Structures** (Phase 2)
   - **Why:** Employees need salary structures to be included in payroll
   - **Time:** 5-15 minutes per employee
   - **Minimum:** Base salary only (allowances/deductions optional)

### 🟡 HIGH PRIORITY (Required if Using These Features)

3. **✅ Create Deduction Types** (Phase 1.2)
   - **Why:** Required if you want to apply deductions (tax, insurance, etc.)
   - **Time:** 5-10 minutes
   - **Note:** Most organizations need this for statutory deductions

4. **✅ Create Allowance Types** (Phase 1.1)
   - **Why:** Required if you want to add allowances to salary structures
   - **Time:** 5-10 minutes
   - **Note:** Optional if no allowances will be used

---

## Quick Start: Minimum Setup for First Payroll

**Fastest path to process your first payroll:**

1. ✅ **Create Pay Period** (2 minutes)
   - Go to: Payroll > Pay Periods > Create New
   - Enter: Period name, start date, end date

2. ✅ **Create Salary Structure for Employee** (5 minutes per employee)
   - Go to: Payroll > Setup > Salary Structures
   - Select employee
   - Enter: Base salary, effective date
   - **Skip allowances/deductions for now** (can add later)

3. ✅ **Create Payroll Run** (5 minutes)
   - Go to: Payroll > Payroll Runs > Create New
   - Select pay period
   - Select employees (or all)
   - Start processing

**Total Time:** ~15 minutes for first payroll (with one employee, no allowances/deductions)

---

## Complete Setup: Full Configuration

**For a fully configured payroll system:**

1. ✅ **Create Allowance Types** (if using)
   - Transportation, Housing, Meal, etc.
   - Mark taxable/non-taxable

2. ✅ **Create Deduction Types** (recommended)
   - Income Tax (statutory)
   - Social Security (statutory)
   - Health Insurance (custom)
   - Other statutory/custom deductions

3. ✅ **Create Salary Structures for All Employees**
   - Base salary
   - Add allowances (select from created types)
   - Add deductions (select from created types)
   - Set effective dates

4. ✅ **Create Pay Periods**
   - Create for current month
   - Optionally create for next 3-6 months in advance

5. ✅ **Process Payroll**
   - Create payroll run
   - Review preview
   - Start processing

---

## Dependency Diagram

```
┌─────────────────────┐
│  Allowance Types    │ (Optional - only if using allowances)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Deduction Types    │ (Optional - only if using deductions)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Salary Structures  │ ◄─── REQUIRED (needs employee to exist)
│  (per employee)    │
│  - Base Salary      │
│  - Allowances*       │ ◄─── Requires Allowance Types
│  - Deductions*      │ ◄─── Requires Deduction Types
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Pay Periods       │ ◄─── REQUIRED (can be created independently)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Payroll Runs      │ ◄─── REQUIRES: Pay Period + Salary Structures
└─────────────────────┘
```

**Legend:**
- `*` = Optional components
- Solid arrows = Required dependencies
- Dashed arrows = Optional dependencies

---

## Common Setup Scenarios

### Scenario 1: Simple Payroll (Base Salary Only)
**Use Case:** Small company, no allowances, no deductions

**Setup:**
1. ✅ Create Pay Period
2. ✅ Create Salary Structures (base salary only)
3. ✅ Process Payroll

**Time:** ~10 minutes

---

### Scenario 2: Standard Payroll (With Deductions)
**Use Case:** Most companies - base salary + statutory deductions

**Setup:**
1. ✅ Create Deduction Types (Income Tax, Social Security, etc.)
2. ✅ Create Pay Period
3. ✅ Create Salary Structures (base salary + deductions)
4. ✅ Process Payroll

**Time:** ~20-30 minutes

---

### Scenario 3: Full Payroll (With Allowances & Deductions)
**Use Case:** Complete compensation package

**Setup:**
1. ✅ Create Allowance Types (Transportation, Housing, etc.)
2. ✅ Create Deduction Types (Tax, Insurance, etc.)
3. ✅ Create Pay Period
4. ✅ Create Salary Structures (base + allowances + deductions)
5. ✅ Process Payroll

**Time:** ~30-45 minutes

---

## Validation Checklist

Before processing your first payroll, verify:

- [ ] At least one pay period exists and is in DRAFT or PROCESSING status
- [ ] At least one employee has an active salary structure
- [ ] All salary structures have:
  - [ ] Base salary set
  - [ ] Effective date set (and covers the pay period)
  - [ ] No overlapping active periods for same employee
- [ ] If using allowances: Allowance types are created
- [ ] If using deductions: Deduction types are created
- [ ] All employees to be processed have active salary structures

---

## Troubleshooting: Common Setup Issues

### Issue: "Cannot create salary structure - allowance type not found"
**Solution:** Create the allowance type first in Phase 1.1

### Issue: "Cannot create salary structure - deduction type not found"
**Solution:** Create the deduction type first in Phase 1.2

### Issue: "No eligible employees found" when creating payroll run
**Solution:** 
- Verify employees have active salary structures
- Check that salary structure effective date covers the pay period
- Ensure salary structures are not ended (endDate is null or in future)

### Issue: "Pay period not found" when creating payroll run
**Solution:** Create a pay period first in Phase 3

### Issue: "Cannot process payroll - pay period is CLOSED"
**Solution:** Create a new pay period or update status to DRAFT/PROCESSING

---

## Best Practices

1. **Set Up Types First**
   - Create all allowance and deduction types before creating salary structures
   - This prevents having to go back and add them later

2. **Create Pay Periods in Advance**
   - Create pay periods for the next 3-6 months
   - Reduces setup time during payroll processing

3. **Batch Employee Setup**
   - Set up salary structures for multiple employees at once
   - Use templates if employees have similar structures

4. **Validate Before Processing**
   - Use the payroll run preview to check for warnings
   - Verify employee count matches expectations
   - Review estimated totals

5. **Document Your Setup**
   - Keep a record of allowance/deduction type codes
   - Document any custom calculation methods
   - Maintain a list of statutory deductions

---

## Setup Time Estimates

| Task | Time per Item | Notes |
|------|---------------|-------|
| Allowance Type | 2-3 minutes | One-time setup |
| Deduction Type | 2-3 minutes | One-time setup |
| Pay Period | 2-5 minutes | Monthly |
| Salary Structure | 5-15 minutes | Per employee |
| Payroll Run | 5-10 minutes | Per run |

**Total Initial Setup:**
- **Minimal (1 employee, no allowances/deductions):** ~15 minutes
- **Standard (10 employees, with deductions):** ~2-3 hours
- **Full (50 employees, allowances + deductions):** ~1-2 days

---

*Last Updated: 2025-01-XX*  
*Version: 1.0*

