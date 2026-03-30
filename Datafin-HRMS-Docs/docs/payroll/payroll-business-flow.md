# Enterprise Payroll Business Flow Documentation

## Overview
This document describes the complete enterprise payroll business process flow - how payroll works from setup to distribution, including all user roles, workflows, decision points, and business rules.

## Table of Contents
1. [Payroll Setup & Configuration Phase](#1-payroll-setup--configuration-phase)
2. [Pay Period Management](#2-pay-period-management)
3. [Payroll Processing Workflow](#3-payroll-processing-workflow)
4. [Payslip Distribution & Access](#4-payslip-distribution--access)
5. [Payroll Reports & Analytics](#5-payroll-reports--analytics)
6. [Payroll Corrections & Adjustments](#6-payroll-corrections--adjustments)
7. [User Roles & Permissions](#7-user-roles--permissions)
8. [Business Rules & Validations](#8-business-rules--validations)
9. [Typical Monthly Payroll Cycle](#9-typical-monthly-payroll-cycle)

---

## 1. Payroll Setup & Configuration Phase
****
### 1.1 Initial Setup (One-Time)
**Who:** HR Admin  
**Purpose:** Configure the payroll system foundation

**Steps:**

1. **Define Allowance Types**
   - Create allowance types (e.g., Transportation, Housing, Meal Allowance)
   - Mark as taxable or non-taxable
   - Assign unique codes for reporting

2. **Define Deduction Types**
   - Create deduction types (e.g., Income Tax, Social Security, Health Insurance)
   - Mark statutory vs. custom deductions
   - Assign unique codes

3. **Configure Calculation Methods**
   - Fixed amount (e.g., $500 transportation allowance)
   - Percentage-based (e.g., 10% of base salary)
   - Conditional (e.g., based on department, position, or other criteria)

### 1.2 Employee Salary Structure Setup
**Who:** HR Admin/HR Staff  
**Purpose:** Define each employee's compensation package

**Steps:**

1. **Set Base Salary**
   - Enter employee's base salary
   - Set effective date (when this salary becomes active)
   - Optionally set end date (for historical tracking)

2. **Add Allowances**
   - Select allowance type
   - Set amount or percentage
   - Configure calculation method
   - System calculates if taxable allowances affect gross salary

3. **Add Deductions**
   - Select deduction type
   - Set amount or percentage
   - System automatically applies statutory deductions based on rules
   - Custom deductions can be added per employee

4. **Calculate Gross Salary**
   - System calculates: Base Salary + All Allowances = Gross Salary
   - Gross Salary - All Deductions = Net Salary

**Business Rules:**
- Only one active salary structure per employee at a time
- Historical structures are preserved for audit
- Changes can be backdated with effective dates
- System validates no overlapping active periods

---

## 2. Pay Period Management

### 2.1 Creating Pay Periods
**Who:** HR Admin  
**Purpose:** Define the time periods for payroll processing

**Process:**

1. **Create Pay Period**
   - Enter period name (e.g., "January 2025")
   - Set start date and end date
   - System auto-calculates calendar month and year
   - Initial status: DRAFT

2. **Validation**
   - System checks for overlapping periods
   - Ensures no duplicate periods for same month/year
   - Validates date ranges are logical

3. **Activation**
   - Pay period moves to PROCESSING when payroll run starts
   - Moves to COMPLETED when all payroll runs are done
   - Moves to CLOSED when period is finalized (no more changes allowed)

**Business Rules:**
- One pay period per calendar month typically
- Can create periods in advance
- Cannot process payroll without an active pay period

**Pay Period Status Flow:**
```
DRAFT → PROCESSING → COMPLETED → CLOSED
```

---

## 3. Payroll Processing Workflow

### 3.1 Initiating Payroll Run
**Who:** HR Admin  
**When:** Typically at end of pay period (e.g., last day of month)

**Process:**

1. **Select Pay Period**
   - Choose the pay period to process
   - System shows period details (dates, status)

2. **Select Employees**
   - Option to process all active employees
   - Or select specific employees (for partial runs, corrections)
   - System filters to show only employees with active salary structures

3. **Review & Confirm**
   - System shows preview of employees to be processed
   - Shows estimated totals (gross pay, deductions, net pay)
   - HR Admin reviews and confirms

4. **Start Processing**
   - System creates payroll run record (status: DRAFT)
   - Moves to PROCESSING status
   - Begins asynchronous batch processing

### 3.2 Payroll Calculation Process
**Who:** System (Automated)  
**What Happens:**

**For Each Employee:**

1. **Retrieve Salary Structure**
   - Get active salary structure for the pay period
   - Verify effective date covers the pay period

2. **Calculate Gross Salary**
   - Start with base salary
   - Add all allowances:
     - Fixed allowances: Add fixed amount
     - Percentage allowances: Calculate percentage of base salary
     - Conditional allowances: Evaluate conditions and apply

3. **Calculate Deductions**
   - Apply statutory deductions (tax, social security, etc.) based on rules
   - Apply custom deductions (fixed, percentage, or conditional)
   - System ensures deductions don't exceed gross salary

4. **Calculate Net Salary**
   - Net Salary = Gross Salary - Total Deductions
   - Validate net salary is positive (or handle negative scenarios)

5. **Generate Payslip**
   - Create payslip record with all calculated values
   - Generate PDF payslip document
   - Store payslip file path

6. **Update Totals**
   - Add employee amounts to payroll run totals
   - Track number of employees processed

**Progress Tracking:**
- System updates progress in real-time (X of Y employees completed)
- Shows estimated completion time
- Displays any errors encountered

### 3.3 Payroll Run Completion
**Who:** System → HR Admin  
**What Happens:**

1. **Status Update**
   - When all employees processed: Status → COMPLETED
   - If errors occur: Status → FAILED (with error details)

2. **Final Summary**
   - Total employees processed
   - Total gross pay
   - Total deductions
   - Total net pay
   - Processing timestamp
   - Processor (HR Admin who initiated)

3. **Payslip Generation**
   - All payslips generated as PDFs
   - Stored in file system
   - Ready for distribution

4. **Pay Period Status**
   - Pay period status may update to COMPLETED if this was the final run

**Payroll Run Status Flow:**
```
DRAFT → PROCESSING → COMPLETED
                    ↓
                  FAILED (if errors)
```

### 3.4 Error Handling
**Scenarios:**
- **Employee without salary structure:** Skip with warning, or use previous structure
- **Calculation errors:** Log error, mark employee as failed, continue with others
- **Missing data:** Flag for HR review, allow manual correction
- **System failures:** Rollback capability, retry mechanism

**HR Actions:**
- Review failed employees
- Correct data issues
- Re-run payroll for specific employees
- Or create correction/adjustment payroll run

---

## 4. Payslip Distribution & Access

### 4.1 HR Admin View
**Who:** HR Admin/HR Staff  
**Purpose:** Manage and distribute payslips

**Capabilities:**

1. **View All Payslips**
   - Filter by pay period, employee, date range
   - Search by employee name or ID
   - See all payslips across all employees

2. **Download Payslips**
   - Download individual payslips (PDF)
   - Bulk download for a payroll run
   - Export payslip data to CSV/Excel

3. **Distribution**
   - Email payslips to employees (if integrated)
   - Print payslips for physical distribution
   - Generate distribution reports

### 4.2 Employee Self-Service
**Who:** Employee  
**Purpose:** Access own payslip information

**Capabilities:**

1. **View My Payslips**
   - See only own payslips
   - Filter by date range or pay period
   - View historical payslips

2. **Download Payslip**
   - Download PDF of own payslip
   - Print payslip
   - View payslip details online

3. **Payslip Details**
   - Gross salary breakdown
   - All allowances listed
   - All deductions listed with explanations
   - Net salary
   - Pay period information

**Security:**
- Employees can only see their own payslips
- Role-based access enforced
- Audit trail of who accessed what

---

## 5. Payroll Reports & Analytics

### 5.1 Payroll Summary Reports
**Who:** HR Admin, Management  
**Purpose:** Understand payroll costs and trends

**Report Types:**

1. **Payroll Run Summary**
   - Total cost per payroll run
   - Employee count
   - Average salary per employee
   - Breakdown by department

2. **Period Comparison**
   - Compare payroll costs month-over-month
   - Year-over-year trends
   - Identify cost increases/decreases

3. **Department Analysis**
   - Payroll cost by department
   - Average salary by department
   - Headcount by department

4. **Allowance/Deduction Analysis**
   - Total allowances paid
   - Total deductions collected
   - Breakdown by type

### 5.2 Export & Integration
**Who:** HR Admin, Accounting Team  
**Purpose:** Export data for accounting systems

**Export Formats:**
- CSV (for Excel import)
- Excel (formatted spreadsheet)
- PDF (formatted reports)
- JSON (for API integration)

**Export Data:**
- Payroll run summary
- Individual payslip data
- Employee-level payroll details
- Department-wise breakdowns

---

## 6. Payroll Corrections & Adjustments

### 6.1 Correction Scenarios
**When:** Errors discovered after payroll completion

**Process:**

1. **Identify Issue**
   - Missing employee
   - Incorrect calculation
   - Wrong salary structure used
   - Missing allowances/deductions

2. **Create Correction Run**
   - Select original pay period
   - Select affected employees
   - Make necessary corrections
   - Process correction payroll

3. **Adjustment Payslips**
   - Generate adjustment payslips
   - Link to original payslip
   - Show before/after comparison

### 6.2 Salary Structure Changes
**Mid-Period Changes:**
- Employee promotion/raise
- Allowance changes
- Deduction updates

**Process:**
1. Update salary structure with new effective date
2. System handles pro-rating if needed
3. Next payroll run uses updated structure

---

## 7. User Roles & Permissions

### 7.1 HR Admin
**Full Access:**
- Create/edit pay periods
- Process payroll
- Manage salary structures
- View all payslips
- Access all reports
- Manage allowance/deduction types
- Export payroll data

### 7.2 HR Staff
**Limited Access:**
- View pay periods
- View payroll runs
- View payslips (read-only)
- View reports
- Cannot process payroll
- Cannot modify salary structures

### 7.3 Employee
**Self-Service Only:**
- View own payslips
- Download own payslips
- View own salary structure (if enabled)
- Cannot access other employees' data

---

## 8. Business Rules & Validations

### 8.1 Pay Period Rules
- One active pay period per month
- Cannot create overlapping periods
- Cannot process payroll for closed periods
- Pay period must be in DRAFT or PROCESSING status to start new run

### 8.2 Salary Structure Rules
- One active structure per employee at a time
- Effective date must be valid
- End date must be after effective date
- Cannot have gaps in salary history

### 8.3 Payroll Processing Rules
- Cannot process payroll without active pay period
- Employees must have active salary structure
- Cannot process same employee twice in same run
- System prevents concurrent payroll runs for same period

### 8.4 Calculation Rules
- Gross salary = Base + Allowances
- Net salary = Gross - Deductions
- Deductions cannot exceed gross salary
- Negative net salary requires approval/flagging

### 8.5 Data Integrity Rules
- All financial amounts must be positive (except adjustments)
- Currency must be consistent within a payroll run
- Historical data cannot be modified (only new records created)
- Complete audit trail maintained for all changes

---

## 9. Typical Monthly Payroll Cycle

### Timeline Overview

**Day 1-25: Normal Operations**
- Employees work
- Attendance tracked
- Leave requests processed
- Salary structure changes can be made

**Day 26-28: Payroll Preparation**
- HR reviews attendance records
- Verify salary structures are current
- Check for pending changes (promotions, raises)
- Review any special cases (bonuses, adjustments)
- Ensure all allowance/deduction types are configured

**Day 29-30: Payroll Processing**
- Create pay period (if not already exists)
- Initiate payroll run
- System processes all employees
- HR reviews processing results
- Verify calculations and totals
- Generate payslips

**Day 1 (Next Month): Distribution**
- Payslips available to employees via self-service portal
- HR distributes payslips (email/print if needed)
- Payroll data exported to accounting system
- Reports generated for management review

**Day 2-5: Review & Corrections**
- Handle any employee inquiries
- Process corrections if discrepancies found
- Create adjustment payroll runs if needed
- Pay period moves to CLOSED automatically after the grace period (or pause auto-close if more time is needed)
- Archive payroll data

### Key Milestones

| Day | Activity | Responsible | Status |
|-----|----------|-------------|--------|
| 1-25 | Normal operations | All | Ongoing |
| 26-28 | Payroll preparation | HR Admin | Preparation |
| 29-30 | Payroll processing | HR Admin + System | Processing |
| 1 (Next) | Payslip distribution | System + HR | Distribution |
| 2-5 | Review & corrections | HR Admin | Review |

### Monthly Checklist

**Before Processing:**
- [ ] All attendance records up to date
- [ ] All salary structures current
- [ ] No pending employee status changes
- [ ] Pay period created and validated
- [ ] All allowance/deduction types configured

**During Processing:**
- [ ] Monitor processing progress
- [ ] Review any errors or warnings
- [ ] Verify employee count matches expected
- [ ] Check totals are reasonable

**After Processing:**
- [ ] Review payroll run summary
- [ ] Verify payslips generated successfully
- [ ] Export data to accounting system
- [ ] Notify employees of payslip availability
- [ ] Generate management reports

**Post-Processing:**
- [ ] Address any employee inquiries
- [ ] Process corrections if needed
- [ ] Confirm pay period auto-closed (or pause/resume auto-close as needed)
- [ ] Archive payroll records

---

## 10. Workflow Diagrams

### 10.1 Payroll Processing Flow

```
┌─────────────────┐
│  HR Admin       │
│  Initiates      │
│  Payroll Run   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Select Pay     │
│  Period         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Select         │
│  Employees      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Review &       │
│  Confirm        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  System         │
│  Processes      │
│  (Batch)        │
└────────┬────────┘
         │
         ├──► For Each Employee:
         │    ├──► Get Salary Structure
         │    ├──► Calculate Gross Salary
         │    ├──► Calculate Deductions
         │    ├──► Calculate Net Salary
         │    └──► Generate Payslip
         │
         ▼
┌─────────────────┐
│  Payroll Run    │
│  Completed      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Payslips      │
│  Available     │
└─────────────────┘
```

### 10.2 Salary Structure Setup Flow

```
┌─────────────────┐
│  HR Admin       │
│  Sets Up        │
│  Employee       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Enter Base     │
│  Salary        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Add            │
│  Allowances     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Add            │
│  Deductions     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  System         │
│  Calculates     │
│  Gross/Net      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Save Salary    │
│  Structure      │
└─────────────────┘
```

---

## 11. Key Calculations

### 11.1 Gross Salary Calculation
```
Gross Salary = Base Salary + Σ(Allowances)

Where Allowances can be:
- Fixed: Add fixed amount
- Percentage: (Percentage × Base Salary)
- Conditional: Based on rules (department, position, etc.)
```

### 11.2 Net Salary Calculation
```
Net Salary = Gross Salary - Σ(Deductions)

Where Deductions can be:
- Fixed: Subtract fixed amount
- Percentage: (Percentage × Gross Salary)
- Conditional: Based on rules (tax brackets, etc.)
```

### 11.3 Example Calculation

**Employee Details:**
- Base Salary: $5,000
- Transportation Allowance (Fixed): $500
- Housing Allowance (Percentage): 20% of base = $1,000
- Income Tax (Statutory): 15% of gross = $975
- Health Insurance (Fixed): $200

**Calculation:**
```
Base Salary:           $5,000.00
Transportation:        $  500.00
Housing (20%):         $1,000.00
─────────────────────────────────
Gross Salary:          $6,500.00

Income Tax (15%):      $  975.00
Health Insurance:      $  200.00
─────────────────────────────────
Total Deductions:      $1,175.00
─────────────────────────────────
Net Salary:            $5,325.00
```

---

## 12. Integration Points

### 12.1 Attendance System
- Payroll may need attendance data for:
  - Pro-rated salary calculations
  - Overtime calculations
  - Leave deductions
  - Absence penalties

### 12.2 Accounting System
- Export payroll data for:
  - General ledger entries
  - Accounts payable
  - Financial reporting
  - Tax reporting

### 12.3 Banking System
- Integration for:
  - Salary disbursement
  - Direct deposit setup
  - Payment file generation

### 12.4 Tax Authorities
- Export data for:
  - Tax filing
  - Compliance reporting
  - Statutory submissions

---

## 13. Compliance & Audit

### 13.1 Audit Trail
- All payroll actions are logged:
  - Who processed payroll
  - When it was processed
  - What changes were made
  - Who accessed payslips

### 13.2 Data Retention
- Historical payroll data maintained for:
  - Legal compliance (typically 7 years)
  - Employee inquiries
  - Financial audits
  - Tax audits

### 13.3 Security
- Role-based access control
- Encrypted data storage
- Secure file transfers
- Access logging

---

## 14. Troubleshooting Common Issues

### 14.1 Employee Not in Payroll Run
**Cause:** No active salary structure  
**Solution:** Create/activate salary structure for employee

### 14.2 Incorrect Calculations
**Cause:** Wrong salary structure or calculation method  
**Solution:** Review and correct salary structure, re-run payroll

### 14.3 Missing Payslips
**Cause:** Processing error or file generation failure  
**Solution:** Check error logs, regenerate payslips for affected employees

### 14.4 Negative Net Salary
**Cause:** Deductions exceed gross salary  
**Solution:** Review deductions, may require manual adjustment or approval

---

## 15. Best Practices

1. **Regular Reviews:** Review salary structures quarterly
2. **Advance Planning:** Create pay periods in advance
3. **Data Validation:** Verify data before processing
4. **Backup:** Maintain backups of payroll data
5. **Documentation:** Document any manual adjustments
6. **Training:** Ensure HR staff are trained on system
7. **Testing:** Test payroll changes in staging environment
8. **Communication:** Notify employees of payroll schedule

---

## Appendix A: Glossary

- **Pay Period:** The time period for which payroll is calculated (typically monthly)
- **Payroll Run:** A single execution of payroll processing for a pay period
- **Salary Structure:** An employee's compensation configuration (base salary, allowances, deductions)
- **Gross Salary:** Total salary before deductions
- **Net Salary:** Salary after all deductions
- **Allowance:** Additional compensation beyond base salary
- **Deduction:** Amount subtracted from gross salary
- **Payslip:** Document showing salary breakdown for an employee
- **Statutory Deduction:** Legally required deduction (tax, social security, etc.)

---

## Appendix B: Status Definitions

### Pay Period Status
- **DRAFT:** Pay period created but not yet processed
- **PROCESSING:** Payroll run in progress
- **COMPLETED:** All payroll runs completed
- **CLOSED:** Period finalized, no more changes allowed

### Payroll Run Status
- **DRAFT:** Payroll run created but not started
- **PROCESSING:** Currently processing employees
- **COMPLETED:** All employees processed successfully
- **FAILED:** Processing failed with errors

---

*Last Updated: 2025-01-XX*  
*Version: 1.0*

