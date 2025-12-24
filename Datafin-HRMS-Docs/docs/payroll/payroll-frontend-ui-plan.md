# Payroll Module - Frontend UI Plan

## Overview
This document outlines the complete frontend UI implementation plan for the Payroll Module. The plan is organized by feature sections matching the backend business flow, with detailed component breakdowns, page structures, and user flows.

**📊 Visual Diagrams:** See [Payroll Frontend UI Diagrams](./payroll-frontend-ui-diagrams.md) for visual representations of navigation, user flows, page layouts, and component hierarchies.

**Technology Stack:**
- **Framework:** Next.js 16 (App Router)
- **UI Library:** shadcn/ui (Radix UI + Tailwind CSS)
- **State Management:** Zustand
- **Forms:** React Hook Form + Zod
- **Icons:** Lucide React
- **HTTP Client:** Axios
- **TypeScript:** Full type safety

---

## Table of Contents
1. [Project Structure](#1-project-structure)
2. [Shared Components & Utilities](#2-shared-components--utilities)
3. [Section 1: Payroll Setup & Configuration](#3-section-1-payroll-setup--configuration)
4. [Section 2: Pay Period Management](#4-section-2-pay-period-management)
5. [Section 3: Payroll Processing Workflow](#5-section-3-payroll-processing-workflow)
6. [Section 4: Payslip Distribution & Access](#6-section-4-payslip-distribution--access)
7. [Section 6: Payroll Corrections & Adjustments](#7-section-6-payroll-corrections--adjustments)
8. [Section 7: User Roles & Permissions](#8-section-7-user-roles--permissions)
9. [Navigation & Layout](#9-navigation--layout)
10. [State Management](#10-state-management)
11. [UI/UX Guidelines](#11-uiux-guidelines)

---

## 1. Project Structure

```
frontend/
├── app/
│   ├── (dashboard)/
│   │   ├── payroll/
│   │   │   ├── page.tsx                          # Payroll Dashboard
│   │   │   ├── setup/
│   │   │   │   ├── allowance-types/
│   │   │   │   │   ├── page.tsx                  # List Allowance Types
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx              # Create Allowance Type
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx              # Edit Allowance Type
│   │   │   │   ├── deduction-types/
│   │   │   │   │   ├── page.tsx                  # List Deduction Types
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx              # Create Deduction Type
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx              # Edit Deduction Type
│   │   │   │   └── salary-structures/
│   │   │   │       ├── page.tsx                  # List Salary Structures
│   │   │   │       ├── employees/
│   │   │   │       │   └── [employeeId]/
│   │   │   │       │       ├── page.tsx          # Employee Salary Structure
│   │   │   │       │       ├── new/
│   │   │   │       │       │   └── page.tsx      # Create Salary Structure
│   │   │   │       │       └── [structureId]/
│   │   │   │       │           └── page.tsx      # Edit Salary Structure
│   │   │   ├── pay-periods/
│   │   │   │   ├── page.tsx                      # List Pay Periods
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx                  # Create Pay Period
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx                  # Pay Period Details
│   │   │   ├── payroll-runs/
│   │   │   │   ├── page.tsx                      # List Payroll Runs
│   │   │   │   ├── new/
│   │   │   │   │   └── page.tsx                  # Create Payroll Run
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx                  # Payroll Run Details
│   │   │   │       └── processing/
│   │   │   │           └── page.tsx              # Real-time Processing View
│   │   │   ├── payslips/
│   │   │   │   ├── page.tsx                      # All Payslips (HR View)
│   │   │   │   ├── [id]/
│   │   │   │   │   └── page.tsx                  # Payslip Details
│   │   │   │   └── adjustments/
│   │   │   │       └── [id]/
│   │   │   │           └── page.tsx               # Create Adjustment
│   │   │   └── reports/
│   │   │       └── page.tsx                      # Payroll Reports (Future)
│   │   └── (employee)/
│   │       └── my-payslips/
│   │           ├── page.tsx                      # My Payslips (Employee)
│   │           ├── [id]/
│   │           │   └── page.tsx                  # My Payslip Details
│   │           └── salary-structure/
│   │               └── page.tsx                  # My Salary Structure
├── components/
│   ├── payroll/
│   │   ├── AllowanceTypeForm.tsx
│   │   ├── DeductionTypeForm.tsx
│   │   ├── SalaryStructureForm.tsx
│   │   ├── PayPeriodForm.tsx
│   │   ├── PayrollRunForm.tsx
│   │   ├── PayslipCard.tsx
│   │   ├── PayslipDetailView.tsx
│   │   ├── PayrollProgressTracker.tsx
│   │   ├── AdjustmentPayslipForm.tsx
│   │   ├── PayslipFilters.tsx
│   │   ├── SalaryBreakdownCard.tsx
│   │   ├── EmployeeSelector.tsx
│   │   └── PayrollSummaryCard.tsx
│   └── ui/                                      # shadcn/ui components
├── lib/
│   ├── api/
│   │   ├── payroll/
│   │   │   ├── allowance-types.ts
│   │   │   ├── deduction-types.ts
│   │   │   ├── salary-structures.ts
│   │   │   ├── pay-periods.ts
│   │   │   ├── payroll-runs.ts
│   │   │   └── payslips.ts
│   │   └── types/
│   │       └── payroll.ts                        # TypeScript types
│   └── hooks/
│       ├── usePayrollRunStatus.ts               # SSE hook for real-time updates
│       ├── usePayslipFilters.ts
│       └── usePayrollPermissions.ts
├── store/
│   └── usePayrollStore.ts                       # Zustand store for payroll state
└── constants/
    └── payroll.ts                               # Payroll constants (statuses, types)
```

---

## 2. Shared Components & Utilities

### 2.1 Reusable UI Components (shadcn/ui)
- **Button** - Primary, secondary, ghost, destructive variants
- **Card** - Container for content sections
- **Dialog** - Modal dialogs for forms and confirmations
- **Table** - Data tables with sorting, filtering, pagination
- **Form** - Form wrapper with validation
- **Input** - Text inputs, number inputs
- **Select** - Dropdown selects
- **DatePicker** - Date selection component
- **Badge** - Status badges (DRAFT, PROCESSING, COMPLETED, etc.)
- **Alert** - Success, error, warning messages
- **Tabs** - Tab navigation
- **Progress** - Progress bars for payroll processing
- **Skeleton** - Loading states
- **Tooltip** - Hover information
- **Dropdown Menu** - Action menus
- **Toast** - Notification toasts

### 2.2 Payroll-Specific Shared Components

#### `CurrencyDisplay.tsx`
- Displays currency values with formatting
- Supports different currencies
- Shows positive/negative values with color coding

#### `StatusBadge.tsx`
- Displays status with color coding:
  - **DRAFT:** Gray
  - **PROCESSING:** Blue (with spinner)
  - **COMPLETED:** Green
  - **FAILED:** Red
  - **CLOSED:** Dark gray

#### `PermissionGate.tsx`
- Role-based access control wrapper
- Hides/shows content based on user role
- Props: `allowedRoles`, `children`

#### `ConfirmDialog.tsx`
- Reusable confirmation dialog
- Used for destructive actions (delete, close period, etc.)

#### `EmptyState.tsx`
- Displays when no data is available
- Customizable icon, title, description, action button

#### `LoadingSpinner.tsx`
- Loading indicator for async operations

---

## 3. Section 1: Payroll Setup & Configuration

### 3.1 Allowance Types Management

#### Page: `/payroll/setup/allowance-types`

**Layout:**
- Header with title "Allowance Types" and "Create New" button (HR_ADMIN only)
- Search bar
- Filter chips (All, Taxable, Non-Taxable)
- Data table with columns:
  - Name
  - Code
  - Taxable Status (Badge)
  - Actions (Edit, Delete - HR_ADMIN only)

**Components:**
- `AllowanceTypesTable.tsx` - Main table component
- `AllowanceTypeForm.tsx` - Create/Edit form

**Form Fields (`AllowanceTypeForm.tsx`):**
- Name (text, required)
- Code (text, required, uppercase, unique validation)
- Is Taxable (checkbox)
- Submit/Cancel buttons

**User Flow:**
1. HR Admin clicks "Create New"
2. Modal opens with form
3. Fill form, submit
4. Success toast, table refreshes
5. Edit: Click edit icon → Modal opens with pre-filled form
6. Delete: Click delete → Confirm dialog → Delete → Refresh

---

### 3.2 Deduction Types Management

#### Page: `/payroll/setup/deduction-types`

**Layout:**
- Similar to Allowance Types
- Header: "Deduction Types"
- Filter chips: All, Statutory, Custom

**Components:**
- `DeductionTypesTable.tsx`
- `DeductionTypeForm.tsx`

**Form Fields:**
- Name (text, required)
- Code (text, required, uppercase)
- Is Statutory (checkbox)
- Submit/Cancel buttons

**User Flow:**
- Same as Allowance Types

---

### 3.3 Salary Structure Management

#### Page: `/payroll/setup/salary-structures`

**Layout:**
- Header: "Salary Structures" with "Create New" button
- Employee search/selector
- List view showing:
  - Employee name/ID
  - Current base salary
  - Effective date
  - Status (Active/Inactive)
  - Actions (View, Edit, Create New - HR_ADMIN only)

**Components:**
- `SalaryStructuresList.tsx` - Employee list with salary structure summary
- `SalaryStructureForm.tsx` - Comprehensive form for creating/editing

#### Page: `/payroll/setup/salary-structures/employees/[employeeId]`

**Layout:**
- Breadcrumb: Payroll > Setup > Salary Structures > [Employee Name]
- Tabs:
  1. **Current Structure** - Active salary structure details
  2. **History** - Historical salary structures
- Action buttons: "Create New Structure" (HR_ADMIN only), "Edit" (HR_ADMIN only)

**Current Structure Tab:**
- Card showing:
  - Base Salary (large, prominent)
  - Effective Date
  - End Date (if applicable)
  - Currency
  - Gross Salary (calculated)
  - Net Salary (calculated)
- **Allowances Section:**
  - Table/list of allowances
  - Each row: Type, Amount, Method, Taxable
  - "Add Allowance" button (HR_ADMIN only)
- **Deductions Section:**
  - Table/list of deductions
  - Each row: Type, Amount, Method, Statutory
  - "Add Deduction" button (HR_ADMIN only)
- **Breakdown Card:**
  - Visual breakdown: Base + Allowances = Gross, Gross - Deductions = Net
  - Color-coded sections

**History Tab:**
- Timeline view of all salary structures
- Each entry: Date range, Base salary, Status
- Click to view details

**Components:**
- `SalaryStructureDetail.tsx` - Main detail view
- `SalaryBreakdownCard.tsx` - Visual breakdown
- `AllowanceList.tsx` - Allowances table
- `DeductionList.tsx` - Deductions table
- `AddAllowanceDialog.tsx` - Modal to add allowance
- `AddDeductionDialog.tsx` - Modal to add deduction

#### Page: `/payroll/setup/salary-structures/employees/[employeeId]/new`

**Layout:**
- Multi-step form wizard:
  1. **Basic Info:**
     - Base Salary (number, required)
     - Effective Date (date picker, required)
     - End Date (date picker, optional)
     - Currency (select, default: USD)
  2. **Allowances:**
     - List of allowances (can be empty)
     - "Add Allowance" button
     - Each allowance: Type (select), Amount (number), Method (select: FIXED/PERCENTAGE)
  3. **Deductions:**
     - List of deductions (can be empty)
     - "Add Deduction" button
     - Each deduction: Type (select), Amount (number), Method (select)
  4. **Review:**
     - Summary of all inputs
     - Calculated Gross/Net salary preview
     - Validation warnings (e.g., end date before effective date)

**Components:**
- `SalaryStructureWizard.tsx` - Multi-step wizard container
- `WizardStep.tsx` - Individual step wrapper
- `SalaryPreview.tsx` - Preview card in review step

**Validation:**
- End date must be after effective date
- Base salary must be positive
- Allowance/deduction amounts must be positive
- Percentage methods: 0-100 range

---

## 4. Section 2: Pay Period Management

### 4.1 Pay Periods List

#### Page: `/payroll/pay-periods`

**Layout:**
- Header: "Pay Periods" with "Create New" button (HR_ADMIN only)
- Filters:
  - Status dropdown (All, DRAFT, PROCESSING, COMPLETED, CLOSED)
  - Date range picker
  - Search by period name
- Cards/Table view toggle
- Data display:
  - Period Name
  - Date Range (Start - End)
  - Calendar Month/Year
  - Status (Badge)
  - Payroll Runs Summary (count, totals)
  - Actions (View, Edit Status, Delete - HR_ADMIN only)

**Components:**
- `PayPeriodsList.tsx` - Main list component
- `PayPeriodCard.tsx` - Card view item
- `PayPeriodTable.tsx` - Table view
- `PayPeriodFilters.tsx` - Filter controls

**User Flow:**
1. View list of pay periods
2. Filter by status/date
3. Click period to view details
4. HR Admin: Create new, edit status, delete (if DRAFT)

---

### 4.2 Pay Period Details

#### Page: `/payroll/pay-periods/[id]`

**Layout:**
- Breadcrumb navigation
- Header with period name and status badge
- Action buttons (HR_ADMIN only):
  - "Update Status" (if not CLOSED)
  - "Pause Auto-Close" / "Resume Auto-Close"
  - "Delete" (if DRAFT and no runs)
- Tabs:
  1. **Overview:**
     - Period information card
     - Date range
     - Calendar month/year
     - Status timeline
  2. **Payroll Runs:**
     - List of all payroll runs for this period
     - Each run: Status, Employee count, Totals, Date, Processor
     - "Create New Run" button (HR_ADMIN only)
  3. **Summary:**
     - Total runs
     - Total employees processed
     - Total gross pay
     - Total net pay
     - Charts/graphs (future)

**Components:**
- `PayPeriodDetail.tsx` - Main detail component
- `PayPeriodInfoCard.tsx` - Period information
- `PayrollRunsList.tsx` - Runs list
- `PayPeriodSummary.tsx` - Summary statistics

---

### 4.3 Create Pay Period

#### Page: `/payroll/pay-periods/new`

**Layout:**
- Form with fields:
  - Period Name (text, required, e.g., "January 2025")
  - Start Date (date picker, required)
  - End Date (date picker, required)
  - Preview: Calendar month/year (auto-calculated)
- Validation:
  - End date must be after start date
  - No overlapping periods
  - Period name should be unique

**Components:**
- `PayPeriodForm.tsx` - Create form

---

## 5. Section 3: Payroll Processing Workflow

### 5.1 Payroll Runs List

#### Page: `/payroll/payroll-runs`

**Layout:**
- Header: "Payroll Runs" with "Create New" button (HR_ADMIN only)
- Filters:
  - Pay Period (select)
  - Status (select)
  - Date range
- Table/Cards view
- Columns:
  - Pay Period
  - Status (Badge with spinner if PROCESSING)
  - Employee Count
  - Totals (Gross, Deductions, Net)
  - Processor
  - Run Date
  - Actions (View, Retry if FAILED - HR_ADMIN only)

**Components:**
- `PayrollRunsList.tsx`
- `PayrollRunCard.tsx`
- `PayrollRunTable.tsx`

---

### 5.2 Create Payroll Run

#### Page: `/payroll/payroll-runs/new`

**Layout:**
- Multi-step wizard:
  1. **Select Pay Period:**
     - Dropdown of available pay periods (DRAFT or PROCESSING)
     - Shows period details (dates, status)
  2. **Select Employees:**
     - Toggle: "Process All Employees" or "Select Specific Employees"
     - If specific: Employee selector (multi-select with search)
     - Shows eligible employee count
     - Warning list (employees without salary structures)
  3. **Preview:**
     - Eligible employee count
     - Warnings (if any)
     - Estimated totals (gross, net)
     - Employee list preview
  4. **Confirm:**
     - Final review
     - "Create & Start" or "Create Draft" buttons

**Components:**
- `PayrollRunWizard.tsx`
- `PayPeriodSelector.tsx`
- `EmployeeSelector.tsx` - Multi-select with search
- `PayrollPreview.tsx` - Preview summary
- `WarningsList.tsx` - Display warnings

**User Flow:**
1. Select pay period
2. Choose employees (all or specific)
3. Review preview
4. Confirm and create
5. Redirect to processing view

---

### 5.3 Payroll Run Details

#### Page: `/payroll/payroll-runs/[id]`

**Layout:**
- Breadcrumb navigation
- Header with run ID and status badge
- Action buttons (HR_ADMIN only):
  - "Start Processing" (if DRAFT)
  - "Retry" (if FAILED)
  - "View Processing" (if PROCESSING)
- Tabs:
  1. **Overview:**
     - Run information
     - Pay period link
     - Processor info
     - Totals summary
  2. **Progress:**
     - Real-time progress bar (if PROCESSING)
     - Employee count (completed/total)
     - Estimated completion time
     - Current employee being processed
     - SSE connection status indicator
  3. **Payslips:**
     - List of all payslips in this run
     - Filter/search
     - Bulk actions (Download ZIP, Export, Distribute)
  4. **Errors:**
     - List of failed employees (if any)
     - Error messages
     - Retry individual employee option

**Components:**
- `PayrollRunDetail.tsx`
- `PayrollProgressTracker.tsx` - Real-time progress with SSE
- `PayslipsList.tsx`
- `ErrorList.tsx`

---

### 5.4 Real-Time Processing View

#### Page: `/payroll/payroll-runs/[id]/processing`

**Layout:**
- Full-screen processing view
- Large progress bar at top
- Real-time stats:
  - Completed / Total
  - Percentage
  - Estimated time remaining
  - Current employee
- Live log/feed:
  - Each employee as they're processed
  - Success/error indicators
  - Timestamps
- Auto-refresh via SSE
- "Close" button to return to details

**Components:**
- `PayrollProcessingView.tsx` - Full-screen processing
- `ProgressBar.tsx` - Animated progress bar
- `ProcessingLog.tsx` - Live feed of processing
- `usePayrollRunStatus.ts` - SSE hook

**SSE Implementation:**
- Connect to `/api/payroll-runs/:id/status/stream`
- Update progress in real-time
- Show connection status
- Handle reconnection

---

## 6. Section 4: Payslip Distribution & Access

### 6.1 All Payslips (HR View)

#### Page: `/payroll/payslips`

**Layout:**
- Header: "All Payslips"
- Advanced filters:
  - Payroll Run (select)
  - Pay Period (select)
  - Employee (search/select)
  - Date range
  - Search by employee name/ID
- Bulk actions toolbar (when items selected):
  - Download Selected
  - Export Selected
  - Email Selected
- Table with columns:
  - Employee (name, ID)
  - Pay Period
  - Gross Salary
  - Net Salary
  - Status (with warning badge if hasWarnings)
  - Generated Date
  - Actions (View, Download, Email)
- Pagination

**Components:**
- `PayslipsTable.tsx`
- `PayslipFilters.tsx` - Advanced filter panel
- `BulkActionsBar.tsx`
- `PayslipRow.tsx` - Table row with actions

---

### 6.2 Payslip Details

#### Page: `/payroll/payslips/[id]`

**Layout:**
- Breadcrumb navigation
- Header with employee name and pay period
- Warning banner (if hasWarnings)
- Action buttons:
  - Download PDF
  - Email Payslip (HR_ADMIN only)
  - Create Adjustment (HR_ADMIN only)
- Tabs:
  1. **Details:**
     - Employee information
     - Pay period information
     - Salary breakdown:
       - Base Salary
       - Allowances (itemized list)
       - Total Allowances
       - Gross Salary
       - Deductions (itemized list)
       - Total Deductions
       - Net Salary
     - Adjustment info (if isAdjustment)
  2. **Adjustments:**
     - List of all adjustments for this payslip
     - Timeline view
     - Before/after comparison
  3. **Audit Log:**
     - Who accessed/downloaded
     - When
     - Actions performed

**Components:**
- `PayslipDetailView.tsx`
- `SalaryBreakdownCard.tsx` - Visual breakdown
- `ItemizedList.tsx` - Allowances/deductions list
- `AdjustmentsTimeline.tsx`
- `AuditLogTable.tsx`

---

### 6.3 Bulk Download

**Feature:** Download ZIP of multiple payslips

**UI:**
- Modal dialog when clicking "Bulk Download"
- Options:
  - Download all from payroll run
  - Download selected payslips
- Progress indicator during ZIP creation
- Download starts automatically

**Components:**
- `BulkDownloadDialog.tsx`

---

### 6.4 Export Payslips

**Feature:** Export payslip data to CSV/JSON

**UI:**
- Modal dialog: "Export Payslips"
- Options:
  - Format (CSV, JSON)
  - Filter options (same as list filters)
  - Date range
- "Export" button
- Download file when ready

**Components:**
- `ExportPayslipsDialog.tsx`

---

### 6.5 Distribute Payslips (Email)

**Feature:** Send payslips via email

**UI:**
- Modal dialog: "Distribute Payslips"
- Options:
  - Send to all employees in payroll run
  - Send to selected employees
- Preview: List of employees who will receive email
- "Send" button
- Progress indicator
- Results summary:
  - Total sent
  - Failed (with reasons)
  - Success list

**Components:**
- `DistributePayslipsDialog.tsx`
- `DistributionResults.tsx`

---

### 6.6 Distribution Report

**Feature:** View distribution status

**UI:**
- Accessible from payroll run details
- Shows:
  - Total payslips
  - Email sent count
  - Email failed count
  - Downloads count
  - Per-employee status:
     - Email sent (yes/no, timestamp)
     - Downloaded (yes/no, timestamp)
- Exportable

**Components:**
- `DistributionReport.tsx`

---

### 6.7 Employee Self-Service: My Payslips

#### Page: `/my-payslips`

**Layout:**
- Header: "My Payslips"
- Filters:
  - Pay Period (select)
  - Date range
- List/Cards view:
  - Pay Period
  - Gross Salary
  - Net Salary
  - Generated Date
  - Actions (View, Download)
- No bulk actions (employee can only access own)

**Components:**
- `MyPayslipsList.tsx`
- `MyPayslipCard.tsx`

---

#### Page: `/my-payslips/[id]`

**Layout:**
- Similar to HR payslip details
- No "Create Adjustment" or "Email" buttons
- Read-only view
- Can download own payslip

**Components:**
- `MyPayslipDetail.tsx` - Reuses `PayslipDetailView` with limited actions

---

### 6.8 Employee Self-Service: My Salary Structure

#### Page: `/my-payslips/salary-structure`

**Layout:**
- Header: "My Salary Structure"
- Current structure card:
  - Base Salary
  - Effective Date
  - Gross/Net calculations
  - Allowances list
  - Deductions list
- History tab:
  - Timeline of past structures
- Read-only (no edit capabilities)

**Components:**
- `MySalaryStructure.tsx`
- Reuses `SalaryStructureDetail` in read-only mode

---

## 7. Section 6: Payroll Corrections & Adjustments

### 7.1 Create Adjustment Payslip

#### Page: `/payroll/payslips/[id]/adjustments/new`

**Layout:**
- Breadcrumb: Payslip > Create Adjustment
- Original payslip summary card (read-only)
- Form:
  - Adjustment Type (select: CORRECTION, SUPPLEMENT, REVERSAL, AMENDMENT)
  - Adjustment Reason (textarea, required)
  - New Values:
    - Gross Salary (number)
    - Total Allowances (number)
    - Total Deductions (number)
    - Net Salary (number, auto-calculated)
  - Before/After Comparison:
    - Side-by-side comparison table
    - Differences highlighted
- Validation:
  - All amounts must be positive
  - Net = Gross - Deductions
- "Create Adjustment" button

**Components:**
- `AdjustmentPayslipForm.tsx`
- `BeforeAfterComparison.tsx` - Side-by-side comparison
- `AdjustmentTypeSelector.tsx` - Type selector with descriptions

**User Flow:**
1. Navigate from payslip details
2. Fill adjustment form
3. Review before/after comparison
4. Submit
5. Redirect to payslip details (shows adjustment created)

---

### 7.2 View Adjustments

**Feature:** View all adjustments for a payslip

**UI:**
- Tab in payslip details: "Adjustments"
- Timeline view:
  - Original payslip
  - Each adjustment in chronological order
  - Shows: Type, Reason, Date, Changes
- Click adjustment to view details
- Visual diff showing what changed

**Components:**
- `AdjustmentsTimeline.tsx`
- `AdjustmentCard.tsx` - Individual adjustment card
- `AdjustmentDiff.tsx` - Visual diff component

---

## 8. Section 7: User Roles & Permissions

### 8.1 Permission-Based UI

**Implementation:**
- `PermissionGate` component wraps restricted content
- Role checks in components:
  - `usePayrollPermissions()` hook
  - Returns: `{ isHRAdmin, isHRStaff, isEmployee, canEdit, canDelete, ... }`

**Examples:**
- Create/Edit buttons only visible to HR_ADMIN
- Delete actions require HR_ADMIN
- Employee views are read-only
- HR_STAFF can view but not modify salary structures

**Components:**
- `PermissionGate.tsx` - Wrapper component
- `usePayrollPermissions.ts` - Permission hook

---

### 8.2 Role-Specific Navigation

**Navigation Menu:**
- **HR_ADMIN:** Full access to all payroll sections
- **HR_STAFF:** View-only access (no setup, no processing)
- **EMPLOYEE:** Only "My Payslips" and "My Salary Structure"

**Implementation:**
- Filter navigation items based on role
- Hide restricted routes
- Show appropriate menu items

---

## 9. Navigation & Layout

### 9.1 Main Navigation

**Payroll Menu Structure:**
```
Payroll
├── Dashboard
├── Setup
│   ├── Allowance Types
│   ├── Deduction Types
│   └── Salary Structures
├── Pay Periods
├── Payroll Runs
├── Payslips
└── Reports (Future)
```

**Employee Menu:**
```
My Payroll
├── My Payslips
└── My Salary Structure
```

### 9.2 Breadcrumbs

**Component:** `Breadcrumb.tsx`
- Shows current location
- Clickable navigation
- Format: Home > Payroll > [Section] > [Page]

### 9.3 Page Layout

**Standard Layout:**
- Header with title and primary action
- Filters/controls bar
- Main content area
- Footer (optional)

**Components:**
- `PageHeader.tsx` - Standardized header
- `PageLayout.tsx` - Wrapper component

---

## 10. State Management

### 10.1 Zustand Store

**Store: `usePayrollStore.ts`**

```typescript
interface PayrollStore {
  // Pay Periods
  payPeriods: PayPeriod[]
  selectedPayPeriod: PayPeriod | null
  fetchPayPeriods: () => Promise<void>
  
  // Payroll Runs
  payrollRuns: PayrollRun[]
  activeRun: PayrollRun | null
  runProgress: RunProgress | null
  fetchPayrollRuns: () => Promise<void>
  subscribeToRun: (runId: string) => void
  
  // Payslips
  payslips: Payslip[]
  selectedPayslip: Payslip | null
  filters: PayslipFilters
  fetchPayslips: (filters?: PayslipFilters) => Promise<void>
  
  // UI State
  isLoading: boolean
  error: string | null
  setError: (error: string | null) => void
}
```

### 10.2 API Hooks

**Custom hooks for API calls:**
- `useAllowanceTypes.ts`
- `useDeductionTypes.ts`
- `useSalaryStructures.ts`
- `usePayPeriods.ts`
- `usePayrollRuns.ts`
- `usePayslips.ts`
- `usePayrollRunStatus.ts` - SSE hook for real-time updates

**Pattern:**
```typescript
export function usePayrollRuns() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => payrollApi.getPayrollRuns(),
  })
  
  return { payrollRuns: data, isLoading, error, refetch }
}
```

---

## 11. UI/UX Guidelines

### 11.1 Design Principles

1. **Clarity:** Clear labels, helpful tooltips, intuitive navigation
2. **Feedback:** Loading states, success/error messages, progress indicators
3. **Consistency:** Reusable components, consistent spacing, uniform styling
4. **Accessibility:** Keyboard navigation, screen reader support, ARIA labels
5. **Performance:** Lazy loading, pagination, optimistic updates

### 11.2 Color Scheme

**Status Colors:**
- **DRAFT:** Gray (`gray-500`)
- **PROCESSING:** Blue (`blue-500`) with spinner
- **COMPLETED:** Green (`green-500`)
- **FAILED:** Red (`red-500`)
- **CLOSED:** Dark gray (`gray-700`)

**Financial Colors:**
- **Positive amounts:** Green (`green-600`)
- **Negative amounts:** Red (`red-600`)
- **Neutral:** Default text color

### 11.3 Typography

- **Headings:** Bold, clear hierarchy
- **Body:** Readable font size (14-16px)
- **Numbers:** Monospace font for financial amounts
- **Labels:** Medium weight, clear

### 11.4 Spacing

- Consistent padding/margins using Tailwind spacing scale
- Card spacing: `p-6`
- Form field spacing: `mb-4`
- Section spacing: `mb-8`

### 11.5 Responsive Design

- **Desktop:** Full feature set, multi-column layouts
- **Tablet:** Adjusted layouts, collapsible sidebars
- **Mobile:** Stacked layouts, bottom navigation, simplified filters

### 11.6 Loading States

- **Skeleton loaders** for list/table content
- **Spinners** for buttons/actions
- **Progress bars** for long-running operations
- **Optimistic updates** where possible

### 11.7 Error Handling

- **Inline errors** in forms
- **Toast notifications** for API errors
- **Error boundaries** for component errors
- **Retry mechanisms** for failed operations

### 11.8 Form Validation

- **Real-time validation** using React Hook Form + Zod
- **Clear error messages** below fields
- **Submit button** disabled until valid
- **Required fields** clearly marked

### 11.9 Data Tables

- **Sortable columns** (click header)
- **Pagination** (20/50/100 items per page)
- **Row selection** for bulk actions
- **Responsive:** Horizontal scroll on mobile
- **Empty states** when no data

### 11.10 Modals & Dialogs

- **Centered** on screen
- **Backdrop** with click-to-close
- **Escape key** to close
- **Focus trap** for accessibility
- **Loading state** during submission

---

## 12. Implementation Phases

### Phase 1: Foundation
1. Project structure setup
2. Shared components (UI library integration)
3. API client setup
4. Type definitions
5. State management setup

### Phase 2: Setup & Configuration
1. Allowance Types CRUD
2. Deduction Types CRUD
3. Salary Structure management
4. Basic navigation

### Phase 3: Pay Periods & Runs
1. Pay Period management
2. Payroll Run creation
3. Basic processing view
4. Payslip list view

### Phase 4: Payslip Features
1. Payslip details view
2. Download functionality
3. Employee self-service
4. Basic filters

### Phase 5: Advanced Features
1. Real-time processing (SSE)
2. Bulk operations
3. Email distribution
4. Adjustments
5. Advanced filters & search

### Phase 6: Polish & Optimization
1. Loading states
2. Error handling
3. Responsive design
4. Performance optimization
5. Accessibility improvements

---

## 13. Future Enhancements (Not in Initial Plan)

1. **Reports & Analytics Dashboard**
   - Charts and graphs
   - Trend analysis
   - Export capabilities

2. **Advanced Search**
   - Full-text search
   - Saved filters
   - Search history

3. **Notifications**
   - Payroll completion alerts
   - Payslip distribution notifications
   - Error alerts

4. **Batch Operations**
   - Bulk salary structure updates
   - Mass employee selection
   - Batch status updates

5. **Mobile App**
   - Native mobile app
   - Push notifications
   - Offline access

---

*Last Updated: 2025-01-XX*  
*Version: 1.0*  
*Status: Planning Phase - No Backend Integration Yet*

