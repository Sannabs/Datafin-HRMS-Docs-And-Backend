# Datafin HRMS - Documentation

Welcome to the Datafin Human Resource Management System documentation.

## Documentation Structure

This documentation is organized into the following sections:

### 1. Architecture
- **[System Architecture](./architecture/system-architecture.md)** - Complete system architecture including 3-tier design, component diagrams, deployment models, security layers, and data flow diagrams.

### 2. Database Design
- **[ER Diagram](./database/er-diagram.md)** - Entity Relationship Diagram with all entities, relationships, and cardinalities for the 8 core modules.
- **[Database Schema](./database/schema.md)** - Detailed database schema including tables, columns, constraints, indexes, triggers, and data integrity rules.

### 3. Technical Design
- **[Technical Design Document (TDD)](./technical-design-document.md)** - High-level technical design covering architecture patterns, module design, data model, API design, security, integrations, and non-functional requirements.

### 4. API Documentation

#### Overview
- **[API Overview](./api/api-overview.md)** - Introduction to the API including authentication, request/response patterns, error handling, rate limiting, pagination, and filtering.

#### Module APIs
- **[Employee API](./api/employee-api.md)** - Employee information management, departments, positions, documents, and dependents.
- **[Recruitment API](./api/recruitment-api.md)** - Job postings, applicant tracking, interviews, offers, and onboarding.
- **[Attendance & Leave API](./api/attendance-leave-api.md)** - Attendance records, leave requests, leave balances, and biometric integration.
- **[Payroll API](./api/payroll-api.md)** - Salary structures, payroll processing, payslip generation, and exports.
- **[Performance API](./api/performance-api.md)** - Goal management, appraisals, ratings, and feedback.
- **[Training API](./api/training-api.md)** - Course management, training assignments, completions, and skills.
- **[Self-Service API](./api/self-service-api.md)** - Employee portal endpoints for profile, leaves, payslips, and dashboard.
- **[Reports API](./api/reports-api.md)** - HR dashboards, analytics, custom reports, and data exports.
- **[Notification API](./api/notification-api.md)** - User notifications, read status management, and notification types.

## Quick Start

1. **Important**: Read [Diagram Viewing Guide](./DIAGRAM_VIEWING_GUIDE.md) to set up tools for viewing visual diagrams
2. Start with the **[System Architecture](./architecture/system-architecture.md)** to understand the overall system design.
3. Review the **[Database Schema](./database/schema.md)** to understand data structures.
4. Read the **[Technical Design Document](./technical-design-document.md)** for comprehensive design specifications.
5. Consult the **[API Overview](./api/api-overview.md)** before implementing any API integration.
6. Refer to specific module API documentation for detailed endpoint specifications.

## Technology Stack

- **Frontend**: React 18+ with TypeScript
- **Backend**: Node.js + Express.js with TypeScript
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Authentication**: Better Auth
- **Deployment**: 
  - **Frontend**: Vercel (Cloud-hosted)
  - **Backend**: Render (Cloud-hosted)
  - **Database**: Render PostgreSQL (Cloud-hosted)

## Core Modules

1. Employee Information Management
2. Recruitment & Onboarding (ATS)
3. Attendance & Leave Management
4. Payroll Management
5. Performance Management
6. Training & Development
7. Employee Self-Service Portal
8. Reports & Dashboards

## Key Features

- **Role-Based Access Control (RBAC)**: Fine-grained permissions
- **Audit Logging**: Complete activity trail
- **Data Encryption**: At rest and in transit
- **Biometric Integration**: Attendance system hooks
- **Automated Payroll**: Salary computation and payslip generation
- **Leave Management**: Approval workflows and accrual tracking
- **Performance Tracking**: Goals, appraisals, and 360° feedback
- **Training Management**: Course assignments and skill tracking

## Documentation Version

**Version**: 1.0  
**Last Updated**: January 2025  
**Status**: Phase 1 Complete

## Next Steps

With Phase 1 (System Architecture & Design) complete, the next phase is:

**Phase 2: Core Development (Sprint A)**
- Development environment setup
- GitHub repository configuration
- Base project structure

For questions or clarifications, please refer to the detailed documentation in each section.

