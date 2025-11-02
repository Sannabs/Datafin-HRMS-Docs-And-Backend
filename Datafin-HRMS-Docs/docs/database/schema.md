# Datafin HRMS - Database Schema

## Overview
This document provides the detailed database schema for the Datafin HRMS, including all tables, columns, constraints, indexes, and relationships. The schema is designed for PostgreSQL 15+.

## Schema Conventions

### Naming Conventions
- **Tables**: Plural, snake_case (e.g., `employees`, `leave_requests`)
- **Columns**: Singular, snake_case (e.g., `employee_id`, `first_name`)
- **Primary Keys**: `id` (UUID type)
- **Foreign Keys**: `{table}_id` (e.g., `department_id`, `employee_id`)
- **Timestamps**: `created_at`, `updated_at` (automatic timestamps)
- **Soft Deletes**: `deleted_at` (nullable timestamp)

### Data Types
- **IDs**: UUID (version 4)
- **Names/Titles**: VARCHAR(255)
- **Descriptions**: TEXT
- **Amounts**: DECIMAL(10, 2)
- **Percentages**: DECIMAL(5, 2)
- **Dates**: DATE
- **Timestamps**: TIMESTAMP WITH TIME ZONE
- **Booleans**: BOOLEAN
- **Enums**: PostgreSQL ENUM types
- **JSON**: JSONB for flexible data structures

## Core Tables

### 1. Authentication & Authorization

#### users
Stores system users mapped to employees or external users.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | User email |
| password_hash | VARCHAR(255) | NOT NULL | Hashed password (Better Auth) |
| email_verified | BOOLEAN | DEFAULT FALSE | Email verification status |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `email`
- Index on `created_at`

#### roles
Defines system roles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Role name (e.g., 'admin', 'hr_officer') |
| description | TEXT | NULL | Role description |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `name`

#### permissions
Defines system permissions for resource access.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| resource | VARCHAR(100) | NOT NULL | Resource name (e.g., 'employee', 'payroll') |
| action | VARCHAR(50) | NOT NULL | Action name (e.g., 'create', 'read', 'update') |
| description | TEXT | NULL | Permission description |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Composite unique index on `(resource, action)`

#### user_roles
Junction table for user-role assignments.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| user_id | UUID | FOREIGN KEY (users.id) ON DELETE CASCADE, NOT NULL | User reference |
| role_id | UUID | FOREIGN KEY (roles.id) ON DELETE CASCADE, NOT NULL | Role reference |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `user_id`, `role_id`
- Composite unique index on `(user_id, role_id)`

#### role_permissions
Junction table for role-permission assignments.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| role_id | UUID | FOREIGN KEY (roles.id) ON DELETE CASCADE, NOT NULL | Role reference |
| permission_id | UUID | FOREIGN KEY (permissions.id) ON DELETE CASCADE, NOT NULL | Permission reference |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `role_id`, `permission_id`
- Composite unique index on `(role_id, permission_id)`

### 2. Employee Information Management

#### employees
Core employee information table.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| user_id | UUID | FOREIGN KEY (users.id) ON DELETE SET NULL | User account reference |
| employee_code | VARCHAR(50) | UNIQUE, NOT NULL | Unique employee ID |
| first_name | VARCHAR(100) | NOT NULL | First name |
| last_name | VARCHAR(100) | NOT NULL | Last name |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Email address |
| phone | VARCHAR(20) | NULL | Phone number |
| date_of_birth | DATE | NULL | Date of birth |
| gender | ENUM('male','female','other','prefer_not_to_say') | NULL | Gender |
| address | TEXT | NULL | Street address |
| city | VARCHAR(100) | NULL | City |
| state | VARCHAR(100) | NULL | State/Province |
| country | VARCHAR(100) | NULL | Country |
| postal_code | VARCHAR(20) | NULL | Postal/ZIP code |
| department_id | UUID | FOREIGN KEY (departments.id) ON DELETE RESTRICT | Department reference |
| position_id | UUID | FOREIGN KEY (positions.id) ON DELETE RESTRICT | Position reference |
| manager_id | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL | Manager reference |
| hire_date | DATE | NOT NULL | Employment start date |
| employment_status | ENUM('active','terminated','resigned','on_leave') | NOT NULL, DEFAULT 'active' | Employment status |
| employee_type | ENUM('full_time','part_time','contract','intern') | NOT NULL | Employment type |
| emergency_contact_name | VARCHAR(100) | NULL | Emergency contact name |
| emergency_contact_phone | VARCHAR(20) | NULL | Emergency contact phone |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Unique indexes on `employee_code`, `email`
- Foreign key indexes on `user_id`, `department_id`, `position_id`, `manager_id`
- Composite index on `(department_id, employment_status)`
- Full-text search index on `(first_name, last_name)`

#### departments
Organizational departments.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Department name |
| description | TEXT | NULL | Department description |
| manager_id | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL | Department manager |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `name`
- Foreign key index on `manager_id`

#### positions
Job positions/titles.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| title | VARCHAR(100) | NOT NULL | Position title |
| description | TEXT | NULL | Position description |
| department_id | UUID | FOREIGN KEY (departments.id) ON DELETE CASCADE | Department reference |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `department_id`
- Composite unique index on `(title, department_id)`

#### employee_documents
Employee document storage.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| document_type | VARCHAR(50) | NOT NULL | Document type (resume, contract, etc.) |
| file_name | VARCHAR(255) | NOT NULL | Original file name |
| file_path | VARCHAR(500) | NOT NULL | Storage path |
| file_size | BIGINT | NOT NULL | File size in bytes |
| mime_type | VARCHAR(100) | NOT NULL | MIME type |
| uploaded_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Upload timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `employee_id`
- Composite index on `(employee_id, document_type)`

#### dependents
Employee dependents (spouse, children, etc.).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| first_name | VARCHAR(100) | NOT NULL | First name |
| last_name | VARCHAR(100) | NOT NULL | Last name |
| relationship | ENUM('spouse','child','parent','sibling','other') | NOT NULL | Relationship to employee |
| date_of_birth | DATE | NULL | Date of birth |
| phone | VARCHAR(20) | NULL | Phone number |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `employee_id`

### 3. Recruitment & Onboarding

#### job_postings
Active and historical job postings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| job_code | VARCHAR(50) | UNIQUE, NOT NULL | Unique job posting code |
| title | VARCHAR(200) | NOT NULL | Job title |
| description | TEXT | NOT NULL | Job description |
| department_id | UUID | FOREIGN KEY (departments.id) ON DELETE RESTRICT | Department reference |
| position_id | UUID | FOREIGN KEY (positions.id) ON DELETE RESTRICT | Position reference |
| employment_type | ENUM('full_time','part_time','contract','intern') | NOT NULL | Employment type |
| experience_required | VARCHAR(100) | NULL | Required experience |
| qualifications | TEXT | NULL | Required qualifications |
| posting_date | DATE | NOT NULL | Posting start date |
| closing_date | DATE | NULL | Posting end date |
| status | ENUM('draft','posted','closed','cancelled') | NOT NULL, DEFAULT 'draft' | Posting status |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `job_code`
- Foreign key indexes on `department_id`, `position_id`
- Composite index on `(status, closing_date)`

#### applicants
Job applicants.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| job_posting_id | UUID | FOREIGN KEY (job_postings.id) ON DELETE CASCADE, NOT NULL | Job posting reference |
| first_name | VARCHAR(100) | NOT NULL | First name |
| last_name | VARCHAR(100) | NOT NULL | Last name |
| email | VARCHAR(255) | NOT NULL | Email address |
| phone | VARCHAR(20) | NULL | Phone number |
| resume_path | VARCHAR(500) | NULL | Resume file path |
| status | ENUM('applied','screening','interview','offered','hired','rejected','withdrawn') | NOT NULL, DEFAULT 'applied' | Application status |
| total_score | DECIMAL(5, 2) | NULL | Overall score |
| notes | TEXT | NULL | Internal notes |
| applied_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Application date |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `job_posting_id`
- Composite index on `(job_posting_id, status)`
- Index on `applied_date`

#### interviews
Interview records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| applicant_id | UUID | FOREIGN KEY (applicants.id) ON DELETE CASCADE, NOT NULL | Applicant reference |
| interviewer_id | UUID | FOREIGN KEY (interviewers.id) ON DELETE RESTRICT, NOT NULL | Interviewer reference |
| interview_type | ENUM('phone','video','in_person','panel') | NOT NULL | Interview type |
| interview_date | DATE | NOT NULL | Interview date |
| interview_time | TIME | NOT NULL | Interview time |
| location | VARCHAR(255) | NULL | Interview location |
| score | DECIMAL(5, 2) | NULL | Interview score |
| feedback | TEXT | NULL | Interviewer feedback |
| status | ENUM('scheduled','completed','cancelled','rescheduled') | NOT NULL, DEFAULT 'scheduled' | Interview status |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `applicant_id`, `interviewer_id`
- Composite index on `(applicant_id, interview_date)`

#### interviewers
Interviewer assignments.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee (interviewer) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `employee_id`
- Unique index on `employee_id`

#### offers
Job offers to applicants.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| applicant_id | UUID | FOREIGN KEY (applicants.id) ON DELETE CASCADE, NOT NULL | Applicant reference |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL | Employee record if hired |
| offered_salary | DECIMAL(10, 2) | NOT NULL | Offered salary |
| offer_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Offer date |
| acceptance_deadline | DATE | NOT NULL | Acceptance deadline |
| status | ENUM('pending','accepted','declined','expired','cancelled') | NOT NULL, DEFAULT 'pending' | Offer status |
| offer_letter_path | VARCHAR(500) | NULL | Offer letter file path |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `applicant_id`, `employee_id`
- Composite index on `(status, acceptance_deadline)`

#### onboarding_tasks
Onboarding checklist tasks.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| task_name | VARCHAR(200) | NOT NULL | Task name |
| description | TEXT | NULL | Task description |
| sequence_order | INTEGER | NOT NULL | Display order |
| task_type | ENUM('document','account','training','orientation','other') | NOT NULL | Task type |
| is_required | BOOLEAN | NOT NULL, DEFAULT TRUE | Required flag |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Index on `sequence_order`

#### onboarding_completions
Onboarding task completions by employee.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| onboarding_task_id | UUID | FOREIGN KEY (onboarding_tasks.id) ON DELETE CASCADE, NOT NULL | Task reference |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| completed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Completion timestamp |
| notes | TEXT | NULL | Completion notes |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `onboarding_task_id`, `employee_id`
- Composite unique index on `(onboarding_task_id, employee_id)`

### 4. Attendance & Leave Management

#### attendance_records
Daily attendance tracking.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| attendance_date | DATE | NOT NULL | Attendance date |
| check_in_time | TIME | NULL | Check-in time |
| check_out_time | TIME | NULL | Check-out time |
| hours_worked | DECIMAL(5, 2) | NULL | Calculated hours |
| attendance_status | ENUM('present','absent','late','half_day','on_leave') | NOT NULL, DEFAULT 'present' | Attendance status |
| notes | TEXT | NULL | Additional notes |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `employee_id`
- Composite unique index on `(employee_id, attendance_date)`
- Index on `attendance_date`

#### leave_types
Leave type definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Leave type name |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Leave type code |
| max_days_per_year | INTEGER | NULL | Maximum days per year |
| carry_forward | BOOLEAN | NOT NULL, DEFAULT FALSE | Allow carry forward |
| max_carry_forward | INTEGER | NULL | Max carry forward days |
| requires_approval | BOOLEAN | NOT NULL, DEFAULT TRUE | Approval required |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique indexes on `name`, `code`

#### leave_requests
Employee leave requests.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| leave_type_id | UUID | FOREIGN KEY (leave_types.id) ON DELETE RESTRICT, NOT NULL | Leave type reference |
| start_date | DATE | NOT NULL | Leave start date |
| end_date | DATE | NOT NULL | Leave end date |
| days_requested | DECIMAL(5, 2) | NOT NULL | Requested days |
| reason | TEXT | NULL | Leave reason |
| status | ENUM('pending','approved','rejected','cancelled') | NOT NULL, DEFAULT 'pending' | Request status |
| approved_by | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL | Approver reference |
| approved_at | TIMESTAMPTZ | NULL | Approval timestamp |
| approval_notes | TEXT | NULL | Approval notes |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `employee_id`, `leave_type_id`, `approved_by`
- Composite indexes on `(employee_id, status)`, `(status, start_date)`

#### leave_balances
Employee leave balances by type and year.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| leave_type_id | UUID | FOREIGN KEY (leave_types.id) ON DELETE RESTRICT, NOT NULL | Leave type reference |
| opening_balance | DECIMAL(5, 2) | NOT NULL, DEFAULT 0 | Opening balance |
| accrued | DECIMAL(5, 2) | NOT NULL, DEFAULT 0 | Days accrued |
| used | DECIMAL(5, 2) | NOT NULL, DEFAULT 0 | Days used |
| closing_balance | DECIMAL(5, 2) | NOT NULL, DEFAULT 0 | Closing balance |
| year | INTEGER | NOT NULL | Year |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `employee_id`, `leave_type_id`
- Composite unique index on `(employee_id, leave_type_id, year)`

### 5. Payroll Management

#### salary_structures
Employee salary structures.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| base_salary | DECIMAL(10, 2) | NOT NULL | Base salary |
| gross_salary | DECIMAL(10, 2) | NOT NULL | Gross salary |
| effective_date | DATE | NOT NULL | Effective date |
| end_date | DATE | NULL | End date (NULL for current) |
| currency | VARCHAR(3) | NOT NULL, DEFAULT 'USD' | Currency code |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `employee_id`
- Composite index on `(employee_id, effective_date)`

#### allowance_types
Allowance type definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Allowance name |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Allowance code |
| description | TEXT | NULL | Allowance description |
| is_taxable | BOOLEAN | NOT NULL, DEFAULT TRUE | Taxable flag |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique indexes on `name`, `code`

#### allowances
Employee allowances.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| salary_structure_id | UUID | FOREIGN KEY (salary_structures.id) ON DELETE CASCADE, NOT NULL | Salary structure reference |
| allowance_type_id | UUID | FOREIGN KEY (allowance_types.id) ON DELETE RESTRICT, NOT NULL | Allowance type reference |
| amount | DECIMAL(10, 2) | NOT NULL | Allowance amount |
| calculation_method | ENUM('fixed','percentage','conditional') | NOT NULL, DEFAULT 'fixed' | Calculation method |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `salary_structure_id`, `allowance_type_id`

#### deduction_types
Deduction type definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Deduction name |
| code | VARCHAR(20) | UNIQUE, NOT NULL | Deduction code |
| description | TEXT | NULL | Deduction description |
| is_statutory | BOOLEAN | NOT NULL, DEFAULT FALSE | Statutory deduction flag |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique indexes on `name`, `code`

#### deductions
Employee deductions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| salary_structure_id | UUID | FOREIGN KEY (salary_structures.id) ON DELETE CASCADE, NOT NULL | Salary structure reference |
| deduction_type_id | UUID | FOREIGN KEY (deduction_types.id) ON DELETE RESTRICT, NOT NULL | Deduction type reference |
| amount | DECIMAL(10, 2) | NOT NULL | Deduction amount |
| calculation_method | ENUM('fixed','percentage','conditional') | NOT NULL, DEFAULT 'fixed' | Calculation method |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `salary_structure_id`, `deduction_type_id`

#### pay_periods
Payroll periods.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| period_name | VARCHAR(100) | UNIQUE, NOT NULL | Period name (e.g., 'Jan 2025') |
| start_date | DATE | NOT NULL | Period start date |
| end_date | DATE | NOT NULL | Period end date |
| calendar_month | INTEGER | NOT NULL, CHECK (calendar_month BETWEEN 1 AND 12) | Month number |
| calendar_year | INTEGER | NOT NULL | Year |
| status | ENUM('draft','processing','completed','closed') | NOT NULL, DEFAULT 'draft' | Period status |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `period_name`
- Composite unique index on `(calendar_year, calendar_month)`
- Index on `(start_date, end_date)`

#### payroll_runs
Payroll execution records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| pay_period_id | UUID | FOREIGN KEY (pay_periods.id) ON DELETE RESTRICT, NOT NULL | Pay period reference |
| run_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Run date |
| total_employees | INTEGER | NOT NULL, DEFAULT 0 | Number of employees processed |
| total_gross_pay | DECIMAL(15, 2) | NOT NULL, DEFAULT 0 | Total gross pay |
| total_deductions | DECIMAL(15, 2) | NOT NULL, DEFAULT 0 | Total deductions |
| total_net_pay | DECIMAL(15, 2) | NOT NULL, DEFAULT 0 | Total net pay |
| status | ENUM('draft','processing','completed','failed') | NOT NULL, DEFAULT 'draft' | Run status |
| processed_by | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL | Processor reference |
| processed_at | TIMESTAMPTZ | NULL | Processing timestamp |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `pay_period_id`, `processed_by`
- Composite index on `(status, run_date)`

#### payslips
Generated payslips.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| payroll_run_id | UUID | FOREIGN KEY (payroll_runs.id) ON DELETE CASCADE, NOT NULL | Payroll run reference |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| gross_salary | DECIMAL(10, 2) | NOT NULL | Gross salary |
| total_allowances | DECIMAL(10, 2) | NOT NULL, DEFAULT 0 | Total allowances |
| total_deductions | DECIMAL(10, 2) | NOT NULL, DEFAULT 0 | Total deductions |
| net_salary | DECIMAL(10, 2) | NOT NULL | Net salary |
| file_path | VARCHAR(500) | NULL | Payslip PDF path |
| generated_at | DATE | NOT NULL, DEFAULT CURRENT_DATE | Generation date |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `payroll_run_id`, `employee_id`
- Composite unique index on `(payroll_run_id, employee_id)`
- Index on `employee_id` for employee queries

### 6. Performance Management

#### goals
Employee performance goals.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| goal_title | VARCHAR(200) | NOT NULL | Goal title |
| description | TEXT | NULL | Goal description |
| goal_type | ENUM('individual','team','department','company') | NOT NULL, DEFAULT 'individual' | Goal type |
| target_date | DATE | NULL | Target completion date |
| status | ENUM('not_started','in_progress','completed','cancelled') | NOT NULL, DEFAULT 'not_started' | Goal status |
| progress_percentage | DECIMAL(5, 2) | NOT NULL, DEFAULT 0 | Progress percentage |
| manager_id | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL | Manager reference |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `employee_id`, `manager_id`
- Composite indexes on `(employee_id, status)`, `(target_date, status)`

#### appraisals
Performance appraisals.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| appraiser_id | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL, NOT NULL | Appraiser reference |
| appraisal_period_start | DATE | NOT NULL | Appraisal period start |
| appraisal_period_end | DATE | NOT NULL | Appraisal period end |
| appraisal_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Appraisal date |
| overall_rating | DECIMAL(3, 2) | NULL | Overall rating |
| status | ENUM('draft','in_progress','completed','acknowledged') | NOT NULL, DEFAULT 'draft' | Appraisal status |
| comments | TEXT | NULL | General comments |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `employee_id`, `appraiser_id`
- Composite indexes on `(employee_id, status)`, `(appraisal_period_start, appraisal_period_end)`

#### rating_scales
Rating scale definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| scale_name | VARCHAR(100) | UNIQUE, NOT NULL | Scale name |
| min_value | DECIMAL(3, 2) | NOT NULL, DEFAULT 0 | Minimum value |
| max_value | DECIMAL(3, 2) | NOT NULL, DEFAULT 5 | Maximum value |
| description | TEXT | NULL | Scale description |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `scale_name`

#### appraisal_ratings
Detailed appraisal ratings by criteria.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| appraisal_id | UUID | FOREIGN KEY (appraisals.id) ON DELETE CASCADE, NOT NULL | Appraisal reference |
| rating_scale_id | UUID | FOREIGN KEY (rating_scales.id) ON DELETE RESTRICT, NOT NULL | Rating scale reference |
| criteria_name | VARCHAR(200) | NOT NULL | Rating criteria |
| rating_value | DECIMAL(3, 2) | NOT NULL | Rating value |
| comments | TEXT | NULL | Comments on criteria |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `appraisal_id`, `rating_scale_id`
- Index on `appraisal_id` for appraisal queries

#### feedback_types
360° feedback type definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | Feedback type name |
| description | TEXT | NULL | Feedback type description |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `name`

#### feedback
360° feedback records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| appraisal_id | UUID | FOREIGN KEY (appraisals.id) ON DELETE CASCADE, NOT NULL | Appraisal reference |
| feedback_type_id | UUID | FOREIGN KEY (feedback_types.id) ON DELETE RESTRICT, NOT NULL | Feedback type reference |
| given_by_id | UUID | FOREIGN KEY (employees.id) ON DELETE SET NULL, NOT NULL | Feedback provider |
| feedback_text | TEXT | NOT NULL | Feedback content |
| relationship_type | ENUM('peer','subordinate','manager','client','other') | NOT NULL | Relationship type |
| given_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Feedback timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `appraisal_id`, `feedback_type_id`, `given_by_id`

### 7. Training & Development

#### courses
Training courses.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| course_code | VARCHAR(50) | UNIQUE, NOT NULL | Unique course code |
| course_name | VARCHAR(200) | NOT NULL | Course name |
| description | TEXT | NULL | Course description |
| duration_hours | INTEGER | NOT NULL | Course duration in hours |
| difficulty_level | ENUM('beginner','intermediate','advanced','expert') | NOT NULL | Difficulty level |
| learning_objectives | TEXT | NULL | Learning objectives |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record update timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `course_code`
- Index on `difficulty_level`

#### training_assignments
Course assignments to employees.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| course_id | UUID | FOREIGN KEY (courses.id) ON DELETE RESTRICT, NOT NULL | Course reference |
| assigned_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Assignment date |
| due_date | DATE | NULL | Completion deadline |
| status | ENUM('assigned','in_progress','completed','overdue','cancelled') | NOT NULL, DEFAULT 'assigned' | Assignment status |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `employee_id`, `course_id`
- Composite indexes on `(employee_id, status)`, `(due_date, status)`

#### completions
Course completion records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| course_id | UUID | FOREIGN KEY (courses.id) ON DELETE RESTRICT, NOT NULL | Course reference |
| score | DECIMAL(5, 2) | NULL | Completion score |
| result_status | ENUM('passed','failed','incomplete') | NOT NULL | Result status |
| completed_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Completion date |
| certificate_path | VARCHAR(500) | NULL | Certificate file path |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `employee_id`, `course_id`
- Composite unique index on `(employee_id, course_id)`
- Index on `completed_date`

#### skills
Skill definitions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| skill_name | VARCHAR(100) | UNIQUE, NOT NULL | Skill name |
| skill_category | VARCHAR(100) | NOT NULL | Skill category |
| description | TEXT | NULL | Skill description |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Unique index on `skill_name`
- Index on `skill_category`

#### skill_records
Employee skill records.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| employee_id | UUID | FOREIGN KEY (employees.id) ON DELETE CASCADE, NOT NULL | Employee reference |
| skill_id | UUID | FOREIGN KEY (skills.id) ON DELETE RESTRICT, NOT NULL | Skill reference |
| proficiency_level | ENUM('beginner','intermediate','advanced','expert') | NOT NULL | Proficiency level |
| acquired_date | DATE | NOT NULL, DEFAULT CURRENT_DATE | Acquisition date |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key indexes on `employee_id`, `skill_id`
- Composite unique index on `(employee_id, skill_id)`

### 8. Audit & Logging

#### audit_logs
System activity audit trail.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique identifier |
| user_id | UUID | FOREIGN KEY (users.id) ON DELETE SET NULL, NULL | User reference |
| resource_type | VARCHAR(100) | NOT NULL | Resource type (e.g., 'employee', 'payroll') |
| resource_id | UUID | NULL | Resource identifier |
| action | VARCHAR(50) | NOT NULL | Action performed (create, update, delete, view) |
| old_values | JSONB | NULL | Previous values (for updates) |
| new_values | JSONB | NULL | New values (for creates/updates) |
| ip_address | VARCHAR(45) | NULL | User IP address |
| user_agent | VARCHAR(500) | NULL | User agent string |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Log timestamp |

**Indexes:**
- Primary index on `id`
- Foreign key index on `user_id`
- Composite indexes on `(resource_type, resource_id)`, `(user_id, created_at)`
- Index on `created_at` for time-based queries
- GIN index on `old_values`, `new_values` for JSONB queries

## Database Triggers

### Automatic Timestamps
All tables with `created_at` and `updated_at` fields will have triggers to automatically update timestamps:

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Repeat for all tables with updated_at
```

### Soft Delete
Tables with soft delete capability (employees, job_postings, etc.) use `deleted_at` timestamp:

```sql
CREATE INDEX idx_employees_deleted_at ON employees(deleted_at) WHERE deleted_at IS NULL;
```

## Indexes Summary

### Foreign Key Indexes
All foreign keys are indexed for join performance.

### Composite Indexes
- `(employee_id, attendance_date)` on attendance_records
- `(employee_id, leave_type_id, year)` on leave_balances
- `(employee_id, pay_period_id)` on payroll_runs
- `(employee_id, course_id)` on completions
- `(status, start_date)` on leave_requests
- `(resource_type, resource_id)` on audit_logs

### Unique Indexes
- All code fields (employee_code, job_code, course_code, etc.)
- Email addresses on users and employees
- Composite unique indexes to prevent duplicates

### Full-Text Search Indexes
- Employee names for search functionality
- Job descriptions and course descriptions
- Using PostgreSQL's full-text search capabilities

## Data Validation Rules

### Check Constraints
- `calendar_month BETWEEN 1 AND 12` on pay_periods
- `progress_percentage BETWEEN 0 AND 100` on goals
- `days_requested > 0` on leave_requests
- `end_date >= start_date` on leave_requests, appraisals
- `end_date >= effective_date` on salary_structures

### Enum Constraints
All enum fields restrict values to predefined sets as defined in the column specifications above.

## Performance Considerations

### Partitioning
Large tables may be partitioned by date:
- `attendance_records` - by month
- `audit_logs` - by month
- `payslips` - by year

### Vacuum & Analyze
Regular VACUUM and ANALYZE operations should be scheduled for optimal query performance.

### Connection Pooling
Use PgBouncer or similar connection pooler for production environments to manage database connections efficiently.

