# Payroll Module - Frontend UI Diagrams

This document contains visual diagrams for the Payroll Module frontend UI plan. All diagrams are in Mermaid format and can be viewed in VS Code, GitHub, or online editors.

---

## 1. Navigation Structure

### 1.1 HR Admin Navigation

```mermaid
graph TD
    A[Payroll Dashboard] --> B[Setup]
    A --> C[Pay Periods]
    A --> D[Payroll Runs]
    A --> E[Payslips]
    A --> F[Reports]
    
    B --> B1[Allowance Types]
    B --> B2[Deduction Types]
    B --> B3[Salary Structures]
    
    B1 --> B1a[List/View]
    B1 --> B1b[Create New]
    B1 --> B1c[Edit]
    
    B2 --> B2a[List/View]
    B2 --> B2b[Create New]
    B2 --> B2c[Edit]
    
    B3 --> B3a[Employee List]
    B3 --> B3b[Employee Structure]
    B3 --> B3c[Create Structure]
    B3 --> B3d[Edit Structure]
    
    C --> C1[List]
    C --> C2[Create New]
    C --> C3[Period Details]
    
    D --> D1[List]
    D --> D2[Create New]
    D --> D3[Run Details]
    D --> D4[Processing View]
    
    E --> E1[All Payslips]
    E --> E2[Payslip Details]
    E --> E3[Create Adjustment]
    
    style A fill:#3b82f6,color:#fff
    style B fill:#10b981,color:#fff
    style C fill:#10b981,color:#fff
    style D fill:#10b981,color:#fff
    style E fill:#10b981,color:#fff
```

### 1.2 Employee Self-Service Navigation

```mermaid
graph TD
    A[My Payroll] --> B[My Payslips]
    A --> C[My Salary Structure]
    
    B --> B1[Payslip List]
    B --> B2[Payslip Details]
    B --> B3[Download PDF]
    
    C --> C1[Current Structure]
    C --> C2[History]
    
    style A fill:#8b5cf6,color:#fff
    style B fill:#10b981,color:#fff
    style C fill:#10b981,color:#fff
```

---

## 2. User Flows

### 2.1 Payroll Setup Flow (HR Admin)

```mermaid
flowchart TD
    Start([HR Admin Starts Setup]) --> AT{Allowance Types<br/>Needed?}
    AT -->|Yes| AT1[Create Allowance Types]
    AT -->|No| DT
    AT1 --> DT
    
    DT{Deduction Types<br/>Needed?}
    DT -->|Yes| DT1[Create Deduction Types]
    DT -->|No| SS
    DT1 --> SS
    
    SS[Create Salary Structures] --> SS1[Select Employee]
    SS1 --> SS2[Enter Base Salary]
    SS2 --> SS3{Add Allowances?}
    SS3 -->|Yes| SS4[Select Allowance Type]
    SS3 -->|No| SS5
    SS4 --> SS5{Add Deductions?}
    SS5 -->|Yes| SS6[Select Deduction Type]
    SS5 -->|No| SS7
    SS6 --> SS7[Review & Save]
    SS7 --> SS8{More Employees?}
    SS8 -->|Yes| SS1
    SS8 -->|No| End([Setup Complete])
    
    style Start fill:#3b82f6,color:#fff
    style End fill:#10b981,color:#fff
    style AT fill:#fbbf24,color:#000
    style DT fill:#fbbf24,color:#000
    style SS3 fill:#fbbf24,color:#000
    style SS5 fill:#fbbf24,color:#000
```

### 2.2 Payroll Processing Flow

```mermaid
sequenceDiagram
    participant HR as HR Admin
    participant UI as Frontend UI
    participant API as Backend API
    participant Queue as BullMQ Queue
    participant Worker as Payroll Worker
    
    HR->>UI: Navigate to Create Payroll Run
    UI->>HR: Show Pay Period Selector
    HR->>UI: Select Pay Period
    UI->>HR: Show Employee Selector
    HR->>UI: Select Employees (or All)
    UI->>API: POST /api/payroll-runs/preview
    API->>UI: Return Preview (eligible count, warnings)
    UI->>HR: Show Preview & Warnings
    HR->>UI: Confirm & Create
    UI->>API: POST /api/payroll-runs
    API->>UI: Return Payroll Run (DRAFT)
    UI->>HR: Show Run Created
    HR->>UI: Click "Start Processing"
    UI->>API: POST /api/payroll-runs/:id/start
    API->>Queue: Add Payroll Job
    API->>UI: Return Job ID & Status (PROCESSING)
    UI->>API: GET /api/payroll-runs/:id/status/stream (SSE)
    API-->>UI: Stream Progress Updates
    UI->>HR: Show Real-time Progress
    
    Queue->>Worker: Process Job
    Worker->>Worker: For Each Employee
    Worker->>API: Calculate Salary
    Worker->>API: Generate Payslip PDF
    Worker->>API: Update Progress
    API-->>UI: Progress Update via SSE
    Worker->>API: Mark Complete
    API-->>UI: Final Status (COMPLETED)
    UI->>HR: Show Completion & Summary
```

### 2.3 Payslip Distribution Flow

```mermaid
flowchart LR
    A[Payroll Run<br/>Completed] --> B[View Payslips]
    B --> C{Distribution<br/>Method?}
    
    C -->|Bulk Download| D[Select Payslips]
    D --> E[Generate ZIP]
    E --> F[Download ZIP]
    
    C -->|Export| G[Select Format<br/>CSV/JSON]
    G --> H[Apply Filters]
    H --> I[Export File]
    
    C -->|Email| J[Select Employees]
    J --> K[Preview Recipients]
    K --> L[Send Emails]
    L --> M[View Results]
    
    style A fill:#10b981,color:#fff
    style C fill:#fbbf24,color:#000
    style F fill:#3b82f6,color:#fff
    style I fill:#3b82f6,color:#fff
    style M fill:#3b82f6,color:#fff
```

---

## 3. Page Layouts

### 3.1 Salary Structure Detail Page Layout

```mermaid
graph TB
    subgraph Page["/payroll/setup/salary-structures/employees/[employeeId]"]
        Header[Header: Employee Name + Breadcrumb]
        Actions[Action Buttons: Create New, Edit]
        
        subgraph Tabs[Tabs Container]
            Tab1[Current Structure Tab]
            Tab2[History Tab]
        end
        
        subgraph CurrentTab[Current Structure Content]
            InfoCard[Info Card:<br/>Base Salary, Dates, Currency]
            GrossNet[Gross/Net Salary Display]
            
            subgraph Allowances[Allowances Section]
                AllowTable[Allowances Table]
                AddAllowBtn[Add Allowance Button]
            end
            
            subgraph Deductions[Deductions Section]
                DeductTable[Deductions Table]
                AddDeductBtn[Add Deduction Button]
            end
            
            Breakdown[Salary Breakdown Card:<br/>Visual Calculation]
        end
    end
    
    Header --> Actions
    Actions --> Tabs
    Tabs --> Tab1
    Tab1 --> CurrentTab
    CurrentTab --> InfoCard
    CurrentTab --> GrossNet
    CurrentTab --> Allowances
    CurrentTab --> Deductions
    CurrentTab --> Breakdown
    
    style Header fill:#3b82f6,color:#fff
    style Actions fill:#10b981,color:#fff
    style InfoCard fill:#e0e7ff
    style Breakdown fill:#dbeafe
```

### 3.2 Payroll Run Processing View Layout

```mermaid
graph TB
    subgraph ProcessingPage["/payroll/payroll-runs/[id]/processing"]
        Header[Header: Payroll Run ID + Status]
        CloseBtn[Close Button]
        
        subgraph Progress[Progress Section]
            ProgressBar[Large Progress Bar<br/>0% - 100%]
            Stats[Stats:<br/>Completed/Total<br/>Percentage<br/>ETA]
            CurrentEmp[Current Employee Being Processed]
        end
        
        subgraph LiveLog[Live Processing Log]
            LogHeader[Log Header]
            LogItems[Log Items:<br/>Employee Name<br/>Status Icon<br/>Timestamp]
        end
        
        subgraph Connection[Connection Status]
            SSEStatus[SSE Connection Indicator]
        end
    end
    
    Header --> CloseBtn
    Header --> Progress
    Progress --> ProgressBar
    Progress --> Stats
    Progress --> CurrentEmp
    Progress --> LiveLog
    LiveLog --> LogHeader
    LiveLog --> LogItems
    LiveLog --> Connection
    Connection --> SSEStatus
    
    style Header fill:#3b82f6,color:#fff
    style ProgressBar fill:#10b981,color:#fff
    style SSEStatus fill:#fbbf24,color:#000
```

### 3.3 Payslip Details Page Layout

```mermaid
graph TB
    subgraph PayslipPage["/payroll/payslips/[id]"]
        Header[Header: Employee Name + Pay Period]
        WarningBanner[Warning Banner<br/>if hasWarnings]
        
        Actions[Action Buttons:<br/>Download PDF<br/>Email Payslip<br/>Create Adjustment]
        
        subgraph Tabs[Tabs Container]
            Tab1[Details Tab]
            Tab2[Adjustments Tab]
            Tab3[Audit Log Tab]
        end
        
        subgraph DetailsTab[Details Content]
            EmpInfo[Employee Information Card]
            PeriodInfo[Pay Period Information]
            
            subgraph Breakdown[Salary Breakdown]
                Base[Base Salary]
                AllowList[Allowances List<br/>Itemized]
                AllowTotal[Total Allowances]
                Gross[Gross Salary]
                DeductList[Deductions List<br/>Itemized]
                DeductTotal[Total Deductions]
                Net[Net Salary]
            end
            
            AdjustInfo[Adjustment Info<br/>if isAdjustment]
        end
        
        subgraph AdjustTab[Adjustments Content]
            Timeline[Adjustments Timeline]
            AdjustCards[Adjustment Cards:<br/>Type, Reason, Date, Changes]
        end
        
        subgraph AuditTab[Audit Log Content]
            AuditTable[Audit Log Table:<br/>Who, When, Action]
        end
    end
    
    Header --> WarningBanner
    WarningBanner --> Actions
    Actions --> Tabs
    Tabs --> Tab1
    Tabs --> Tab2
    Tabs --> Tab3
    Tab1 --> DetailsTab
    Tab2 --> AdjustTab
    Tab3 --> AuditTab
    
    style Header fill:#3b82f6,color:#fff
    style WarningBanner fill:#fbbf24,color:#000
    style Breakdown fill:#dbeafe
    style Timeline fill:#e0e7ff
```

---

## 4. Component Hierarchy

### 4.1 Salary Structure Component Tree

```mermaid
graph TD
    SalaryStructurePage[SalaryStructurePage] --> SalaryStructureDetail[SalaryStructureDetail]
    
    SalaryStructureDetail --> PageHeader[PageHeader]
    SalaryStructureDetail --> Tabs[Tabs Component]
    SalaryStructureDetail --> ActionButtons[ActionButtons]
    
    Tabs --> CurrentTab[CurrentStructureTab]
    Tabs --> HistoryTab[HistoryTab]
    
    CurrentTab --> InfoCard[InfoCard]
    CurrentTab --> SalaryBreakdownCard[SalaryBreakdownCard]
    CurrentTab --> AllowanceList[AllowanceList]
    CurrentTab --> DeductionList[DeductionList]
    
    SalaryBreakdownCard --> CurrencyDisplay[CurrencyDisplay]
    
    AllowanceList --> AllowanceRow[AllowanceRow]
    AllowanceList --> AddAllowanceDialog[AddAllowanceDialog]
    
    DeductionList --> DeductionRow[DeductionRow]
    DeductionList --> AddDeductionDialog[AddDeductionDialog]
    
    AddAllowanceDialog --> AllowanceTypeForm[AllowanceTypeForm]
    AddDeductionDialog --> DeductionTypeForm[DeductionTypeForm]
    
    style SalaryStructurePage fill:#3b82f6,color:#fff
    style SalaryStructureDetail fill:#10b981,color:#fff
```

### 4.2 Payroll Run Component Tree

```mermaid
graph TD
    PayrollRunPage[PayrollRunPage] --> PayrollRunDetail[PayrollRunDetail]
    
    PayrollRunDetail --> PageHeader[PageHeader]
    PayrollRunDetail --> StatusBadge[StatusBadge]
    PayrollRunDetail --> ActionButtons[ActionButtons]
    PayrollRunDetail --> Tabs[Tabs]
    
    Tabs --> OverviewTab[OverviewTab]
    Tabs --> ProgressTab[ProgressTab]
    Tabs --> PayslipsTab[PayslipsTab]
    Tabs --> ErrorsTab[ErrorsTab]
    
    OverviewTab --> PayrollSummaryCard[PayrollSummaryCard]
    OverviewTab --> RunInfoCard[RunInfoCard]
    
    ProgressTab --> PayrollProgressTracker[PayrollProgressTracker]
    PayrollProgressTracker --> ProgressBar[ProgressBar]
    PayrollProgressTracker --> ProcessingLog[ProcessingLog]
    PayrollProgressTracker --> usePayrollRunStatus[usePayrollRunStatus Hook]
    
    PayslipsTab --> PayslipsTable[PayslipsTable]
    PayslipsTab --> BulkActionsBar[BulkActionsBar]
    
    ErrorsTab --> ErrorList[ErrorList]
    ErrorList --> ErrorCard[ErrorCard]
    
    style PayrollRunPage fill:#3b82f6,color:#fff
    style PayrollProgressTracker fill:#10b981,color:#fff
    style usePayrollRunStatus fill:#8b5cf6,color:#fff
```

---

## 5. Multi-Step Wizard Flow

### 5.1 Create Payroll Run Wizard

```mermaid
stateDiagram-v2
    [*] --> Step1: Start Wizard
    
    Step1: Select Pay Period
    Step1 --> Step2: Next (Period Selected)
    Step1 --> Cancel: Cancel
    
    Step2: Select Employees
    Step2 --> Step2: Toggle All/Specific
    Step2 --> Step3: Next (Employees Selected)
    Step2 --> Step1: Back
    
    Step3: Preview
    Step3 --> Step4: Next (Review OK)
    Step3 --> Step2: Back
    
    Step4: Confirm
    Step4 --> Creating: Create & Start
    Step4 --> Draft: Create Draft
    Step4 --> Step3: Back
    
    Creating --> Processing: Redirect to Processing
    Draft --> Details: Redirect to Details
    Cancel --> [*]
    Processing --> [*]
    Details --> [*]
    
    note right of Step1
        - Dropdown of available periods
        - Show period details
    end note
    
    note right of Step2
        - Toggle: All vs Specific
        - Multi-select with search
        - Show eligible count
        - Display warnings
    end note
    
    note right of Step3
        - Eligible employee count
        - Warnings list
        - Estimated totals
        - Employee preview
    end note
    
    note right of Step4
        - Final review
        - Two options:
        Create & Start
        Create Draft
    end note
```

### 5.2 Create Salary Structure Wizard

```mermaid
stateDiagram-v2
    [*] --> Step1: Start Wizard
    
    Step1: Basic Info
    Step1 --> Step2: Next (Valid)
    Step1 --> Cancel: Cancel
    
    Step2: Allowances
    Step2 --> Step3: Next
    Step2 --> Step1: Back
    Step2 --> Step2: Add Allowance
    Step2 --> Step2: Remove Allowance
    
    Step3: Deductions
    Step3 --> Step4: Next
    Step3 --> Step2: Back
    Step3 --> Step3: Add Deduction
    Step3 --> Step3: Remove Deduction
    
    Step4: Review
    Step4 --> Saving: Submit
    Step4 --> Step3: Back
    
    Saving --> Success: Save Success
    Saving --> Error: Save Error
    Error --> Step4: Retry
    Success --> [*]
    Cancel --> [*]
    
    note right of Step1
        - Base Salary
        - Effective Date
        - End Date (optional)
        - Currency
    end note
    
    note right of Step2
        - List of allowances
        - Add/Remove buttons
        - Type, Amount, Method
    end note
    
    note right of Step3
        - List of deductions
        - Add/Remove buttons
        - Type, Amount, Method
    end note
    
    note right of Step4
        - Summary of all inputs
        - Calculated preview
        - Validation warnings
    end note
```

---

## 6. Permission-Based Access Flow

### 6.1 Role-Based UI Visibility

```mermaid
graph TD
    User[User Logs In] --> CheckRole{Check User Role}
    
    CheckRole -->|HR_ADMIN| HRAdminView[HR Admin View]
    CheckRole -->|HR_STAFF| HRStaffView[HR Staff View]
    CheckRole -->|EMPLOYEE| EmployeeView[Employee View]
    
    HRAdminView --> FullAccess[Full Access:<br/>- Create/Edit/Delete<br/>- Process Payroll<br/>- All Reports]
    
    HRStaffView --> ReadOnly[Read-Only Access:<br/>- View All Data<br/>- No Modifications<br/>- View Reports]
    
    EmployeeView --> SelfService[Self-Service Only:<br/>- Own Payslips<br/>- Own Salary Structure<br/>- Download Own Payslips]
    
    FullAccess --> PermissionGate1[PermissionGate Component]
    ReadOnly --> PermissionGate2[PermissionGate Component]
    SelfService --> PermissionGate3[PermissionGate Component]
    
    PermissionGate1 --> ShowContent1[Show All Content]
    PermissionGate2 --> HideEditButtons[Hide Edit/Delete Buttons]
    PermissionGate3 --> HideOtherData[Hide Other Employees' Data]
    
    style User fill:#3b82f6,color:#fff
    style HRAdminView fill:#10b981,color:#fff
    style HRStaffView fill:#fbbf24,color:#000
    style EmployeeView fill:#8b5cf6,color:#fff
```

---

## 7. Real-Time Processing Flow (SSE)

### 7.1 Server-Sent Events Flow

```mermaid
sequenceDiagram
    participant UI as Frontend UI
    participant Hook as usePayrollRunStatus
    participant SSE as EventSource
    participant API as Backend API
    participant Worker as Payroll Worker
    
    UI->>Hook: Initialize Hook with runId
    Hook->>SSE: Create EventSource<br/>/api/payroll-runs/:id/status/stream
    SSE->>API: Connect to SSE Endpoint
    API-->>SSE: Connection Established
    
    Worker->>API: Update Progress (Employee 1/100)
    API-->>SSE: Send Progress Event
    SSE->>Hook: Receive Progress Data
    Hook->>UI: Update State (progress: 1%)
    UI->>UI: Re-render Progress Bar
    
    Worker->>API: Update Progress (Employee 50/100)
    API-->>SSE: Send Progress Event
    SSE->>Hook: Receive Progress Data
    Hook->>UI: Update State (progress: 50%)
    UI->>UI: Re-render Progress Bar & Stats
    
    Worker->>API: Update Progress (Employee 100/100)
    API-->>SSE: Send Complete Event
    SSE->>Hook: Receive Complete Data
    Hook->>UI: Update State (status: COMPLETED)
    UI->>UI: Show Completion Message
    Hook->>SSE: Close Connection
    
    Note over SSE,API: Connection stays open<br/>until completion or error
```

---

## 8. Data Flow: Payslip Distribution

### 8.1 Bulk Download Flow

```mermaid
flowchart TD
    A[HR Admin Clicks<br/>Bulk Download] --> B{Selection Type?}
    
    B -->|All from Run| C[GET /api/payslips/payroll-run/:id/bulk-download]
    B -->|Selected Payslips| D[POST /api/payslips/bulk-download<br/>with IDs array]
    
    C --> E[Backend Generates ZIP]
    D --> E
    
    E --> F[Backend Streams ZIP]
    F --> G[Frontend Receives Blob]
    G --> H[Create Download Link]
    H --> I[Trigger Browser Download]
    I --> J[Show Success Toast]
    
    E -->|Error| K[Show Error Toast]
    
    style A fill:#3b82f6,color:#fff
    style E fill:#10b981,color:#fff
    style I fill:#10b981,color:#fff
    style K fill:#ef4444,color:#fff
```

### 8.2 Email Distribution Flow

```mermaid
sequenceDiagram
    participant HR as HR Admin
    participant UI as Frontend UI
    participant API as Backend API
    participant Email as Email Service
    participant Emp as Employee
    
    HR->>UI: Click "Distribute Payslips"
    UI->>HR: Show Distribution Dialog
    HR->>UI: Select "Send to All" or Specific Employees
    HR->>UI: Click "Send"
    
    UI->>API: POST /api/payslips/payroll-run/:id/distribute
    API->>API: Get All Payslips for Run
    API->>API: Get Employee Email Addresses
    
    loop For Each Employee
        API->>Email: Send Email with Payslip PDF
        Email->>Emp: Deliver Email
        Email-->>API: Delivery Status
    end
    
    API-->>UI: Return Results:<br/>- Total Sent<br/>- Failed Count<br/>- Per-Employee Status
    
    UI->>HR: Show Distribution Results
    HR->>UI: View Distribution Report
    UI->>API: GET /api/payslips/payroll-run/:id/distribution-report
    API-->>UI: Return Detailed Report
    UI->>HR: Display Report
```

---

## 9. Component State Management

### 9.1 Zustand Store Structure

```mermaid
graph TB
    Store[usePayrollStore] --> PayPeriods[Pay Periods State]
    Store --> PayrollRuns[Payroll Runs State]
    Store --> Payslips[Payslips State]
    Store --> UIState[UI State]
    
    PayPeriods --> PP1[payPeriods: PayPeriod[]]
    PayPeriods --> PP2[selectedPayPeriod: PayPeriod | null]
    PayPeriods --> PP3[fetchPayPeriods: Function]
    
    PayrollRuns --> PR1[payrollRuns: PayrollRun[]]
    PayrollRuns --> PR2[activeRun: PayrollRun | null]
    PayrollRuns --> PR3[runProgress: RunProgress | null]
    PayrollRuns --> PR4[fetchPayrollRuns: Function]
    PayrollRuns --> PR5[subscribeToRun: Function]
    
    Payslips --> PS1[payslips: Payslip[]]
    Payslips --> PS2[selectedPayslip: Payslip | null]
    Payslips --> PS3[filters: PayslipFilters]
    Payslips --> PS4[fetchPayslips: Function]
    
    UIState --> UI1[isLoading: boolean]
    UIState --> UI2[error: string | null]
    UIState --> UI3[setError: Function]
    
    style Store fill:#8b5cf6,color:#fff
    style PayPeriods fill:#3b82f6,color:#fff
    style PayrollRuns fill:#10b981,color:#fff
    style Payslips fill:#f59e0b,color:#fff
```

---

## 10. Responsive Layout Breakpoints

### 10.1 Layout Adaptation

```mermaid
graph LR
    subgraph Desktop[Desktop > 1024px]
        D1[Multi-column Layout]
        D2[Sidebar Navigation]
        D3[Full Filter Panel]
        D4[Table View]
    end
    
    subgraph Tablet[Tablet 768px - 1024px]
        T1[2-column Layout]
        T2[Collapsible Sidebar]
        T3[Collapsible Filters]
        T4[Card/Table Toggle]
    end
    
    subgraph Mobile[Mobile < 768px]
        M1[Single Column]
        M2[Bottom Navigation]
        M3[Modal Filters]
        M4[Card View Only]
    end
    
    Desktop --> Tablet
    Tablet --> Mobile
    
    style Desktop fill:#10b981,color:#fff
    style Tablet fill:#fbbf24,color:#000
    style Mobile fill:#3b82f6,color:#fff
```

---

## Viewing These Diagrams

To view these diagrams:

1. **VS Code:** Install "Markdown Preview Enhanced" extension, then preview this file
2. **Online:** Copy any diagram code to [mermaid.live](https://mermaid.live)
3. **GitHub:** Push to repository - diagrams render automatically
4. **Obsidian:** Open this file in Obsidian - native Mermaid support

For more information, see: [Diagram Viewing Guide](../DIAGRAM_VIEWING_GUIDE.md)

---

*Last Updated: 2025-01-XX*  
*Version: 1.0*

