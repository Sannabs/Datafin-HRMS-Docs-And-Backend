# Datafin HRMS - System Architecture

## 1. High-Level System Architecture

### Overview
The Datafin Human Resource Management System (HRMS) is built on a 3-tier architecture that separates concerns across Presentation, Application, and Data layers. The system is designed for hybrid deployment (cloud or on-premise) with robust security and integration capabilities.

### Architectural Tiers

```mermaid
graph TB
    subgraph "Presentation Layer"
        A[React Web Application<br/>- Employee Self-Service Portal<br/>- HR Management Dashboard<br/>- Admin Console]
    end
    
    subgraph "Application Layer"
        B[Express.js API Server<br/>- RESTful API Gateway<br/>- Business Logic<br/>- Better Auth Integration]
        C[External Service Integrations<br/>- Email Service<br/>- File Storage<br/>- Notification Service]
    end
    
    subgraph "Data Layer"
        D[(PostgreSQL Database<br/>- Employee Data<br/>- Transactions<br/>- Audit Logs)]
        E[File Storage<br/>- Documents<br/>- Payslips<br/>- Employee Photos]
    end
    
    subgraph "External Systems"
        F[Biometric Systems<br/>Attendance Devices]
        G[ERP Systems<br/>Accounting]
        H[Email Servers]
    end
    
    A -->|HTTPS/REST| B
    B -->|SQL Queries| D
    B -->|File Operations| E
    B -->|Service Calls| C
    B <-->|API Integration| F
    B <-->|API Integration| G
    B <-->|SMTP| H
```

## 2. Component Architecture

### Core Components

```mermaid
graph LR
    subgraph "Frontend Layer"
        UI[React Application]
        UI1[Employee Portal Module]
        UI2[HR Dashboard Module]
        UI3[Admin Module]
        UI --> UI1
        UI --> UI2
        UI --> UI3
    end
    
    subgraph "Backend Services"
        API[Express.js API Gateway]
        AUTH[Better Auth Service]
        EMP[Employee Service]
        REC[Recruitment Service]
        ATT[Attendance Service]
        PAY[Payroll Service]
        PERF[Performance Service]
        TRAIN[Training Service]
        RPT[Reporting Service]
        
        API --> AUTH
        API --> EMP
        API --> REC
        API --> ATT
        API --> PAY
        API --> PERF
        API --> TRAIN
        API --> RPT
    end
    
    subgraph "Data Services"
        DB[(PostgreSQL)]
        CACHE[(Redis Cache)]
        STORAGE[File Storage Service]
    end
    
    EMP --> DB
    REC --> DB
    ATT --> DB
    PAY --> DB
    PERF --> DB
    TRAIN --> DB
    RPT --> DB
    RPT --> CACHE
    EMP --> STORAGE
    PAY --> STORAGE
    
    UI -->|HTTPS| API
    AUTH --> DB
```

## 3. Module Architecture

### Module Breakdown

```mermaid
graph TD
    subgraph "Employee Information Management"
        EM1[Employee CRUD]
        EM2[Document Management]
        EM3[Department & Position Management]
        EM4[Dependent Management]
    end
    
    subgraph "Recruitment & Onboarding"
        RC1[Job Posting Management]
        RC2[Applicant Tracking System]
        RC3[Interview Scheduling]
        RC4[Offer Letter Generation]
        RC5[Onboarding Workflow]
    end
    
    subgraph "Attendance & Leave Management"
        AL1[Attendance Records]
        AL2[Leave Request Processing]
        AL3[Leave Approval Workflow]
        AL4[Leave Balance Management]
        AL5[Biometric Integration]
    end
    
    subgraph "Payroll Management"
        PY1[Salary Computation Engine]
        PY2[Statutory Deductions]
        PY3[Payslip Generation]
        PY4[Payroll Export]
    end
    
    subgraph "Performance Management"
        PM1[Goal Setting]
        PM2[Appraisal Workflow]
        PM3[360° Feedback]
        PM4[Performance Reports]
    end
    
    subgraph "Training & Development"
        TD1[Course Management]
        TD2[Training Assignment]
        TD3[Completion Tracking]
        TD4[Skill Matrix]
    end
    
    subgraph "Employee Self-Service"
        SS1[Profile Management]
        SS2[Leave Requests]
        SS3[Payslip Access]
        SS4[Appraisal Input]
    end
    
    subgraph "Reports & Dashboards"
        RP1[HR Dashboards]
        RP2[Analytics Engine]
        RP3[Custom Reports]
        RP4[Data Export]
    end
    
    RC5 --> EM1
    AL2 --> AL3
    AL1 --> AL4
    PY1 --> PY2
    PY1 --> PY3
    PM2 --> PM3
    TD2 --> TD3
    SS2 --> AL2
    SS3 --> PY3
```

## 4. Deployment Architecture (Hybrid Model)

### Cloud Deployment Scenario

```mermaid
graph TB
    subgraph "Public Internet"
        USER[End Users<br/>Employees/HR/Admin]
    end
    
    subgraph "Cloud Infrastructure"
        LB[Load Balancer<br/>Azure/AWS/GCP]
        
        subgraph "Web Tier"
            WEB1[React App Instance 1]
            WEB2[React App Instance 2]
        end
        
        subgraph "API Tier"
            API1[Express API Server 1]
            API2[Express API Server 2]
        end
        
        subgraph "Database Tier"
            DBP[(PostgreSQL Primary)]
            DBS[(PostgreSQL Replica)]
        end
        
        subgraph "Storage"
            FS[Cloud Storage<br/>Documents/Files]
        end
        
        subgraph "Cache"
            REDIS[(Redis Cache)]
        end
    end
    
    subgraph "On-Premise Infrastructure"
        BIOMETRIC[Biometric Systems<br/>Attendance Devices]
        ERP[ERP Systems<br/>Accounting]
    end
    
    USER -->|HTTPS| LB
    LB --> WEB1
    LB --> WEB2
    WEB1 --> API1
    WEB2 --> API2
    API1 --> DBP
    API2 --> DBP
    DBP --> DBS
    API1 --> FS
    API2 --> FS
    API1 --> REDIS
    API2 --> REDIS
    
    API1 <-->|VPN/API| BIOMETRIC
    API2 <-->|VPN/API| BIOMETRIC
    API1 <-->|VPN/API| ERP
    API2 <-->|VPN/API| ERP
```

### On-Premise Deployment Scenario

```mermaid
graph TB
    subgraph "Corporate Network"
        USER[End Users<br/>Employees/HR/Admin]
        
        subgraph "DMZ"
            LB[Load Balancer]
        end
        
        subgraph "Application Servers"
            WEB[React Web Server]
            API[Express API Server Cluster]
        end
        
        subgraph "Database Servers"
            DBP[(PostgreSQL Primary)]
            DBS[(PostgreSQL Replica)]
        end
        
        subgraph "File Storage"
            NAS[Network Attached Storage]
        end
        
        subgraph "Internal Services"
            BIOMETRIC[Biometric Systems]
            ERP[ERP Systems]
            EMAIL[Email Server]
        end
    end
    
    USER -->|HTTPS| LB
    LB --> WEB
    WEB --> API
    API --> DBP
    DBP --> DBS
    API --> NAS
    API <--> BIOMETRIC
    API <--> ERP
    API <--> EMAIL
```

## 5. Security Architecture

### Security Layers

```mermaid
graph TB
    subgraph "Network Layer Security"
        FIREWALL[Firewall/IPS]
        WAF[Web Application Firewall]
        DDoS[DDoS Protection]
    end
    
    subgraph "Application Layer Security"
        SSL[SSL/TLS Encryption]
        AUTH[Better Auth<br/>- JWT Tokens<br/>- Session Management<br/>- Password Hashing]
        RBAC[Role-Based Access Control<br/>- Permissions Matrix<br/>- Resource-Level Access]
        CORS[CORS Policy]
        RATE[Rate Limiting]
    end
    
    subgraph "Data Layer Security"
        ENCRYPT[Data Encryption<br/>- At Rest<br/>- In Transit]
        AUDIT[Audit Logging<br/>- All User Actions<br/>- Sensitive Operations]
        BACKUP[Secure Backups<br/>- Encrypted Backups<br/>- Offsite Storage]
    end
    
    subgraph "API Security"
        API_SEC1[API Key Validation]
        API_SEC2[JWT Validation]
        API_SEC3[Request Validation]
        API_SEC4[SQL Injection Prevention]
    end
    
    INTERNET --> FIREWALL
    FIREWALL --> DDoS
    DDoS --> WAF
    WAF --> SSL
    SSL --> AUTH
    AUTH --> RBAC
    RBAC --> CORS
    CORS --> RATE
    RATE --> API_SEC1
    API_SEC1 --> API_SEC2
    API_SEC2 --> API_SEC3
    API_SEC3 --> API_SEC4
```

### Better Auth Integration

```mermaid
graph LR
    subgraph "Better Auth Components"
        AUTH_CORE[Better Auth Core<br/>Session Management]
        PROV[Email/Password Provider]
        JWT_AUTH[JWT Token Service]
        REFRESH[Refresh Token Handler]
        PERM[Permission Engine]
    end
    
    subgraph "Application Flow"
        LOGIN[User Login]
        VERIFY[Token Verification]
        PROTECT[Protected Routes]
        ROLE_CHECK[Role Verification]
        PERM_CHECK[Permission Check]
    end
    
    LOGIN --> PROV
    PROV --> JWT_AUTH
    JWT_AUTH --> AUTH_CORE
    AUTH_CORE --> REFRESH
    
    PROTECT --> VERIFY
    VERIFY --> JWT_AUTH
    ROLE_CHECK --> PERM
    PERM_CHECK --> PERM
```

## 6. Data Flow Diagrams

### Login Flow

```mermaid
sequenceDiagram
    participant U as User (React)
    participant B as Better Auth
    participant API as Express API
    participant DB as PostgreSQL
    
    U->>B: Submit Credentials
    B->>DB: Validate User
    DB-->>B: User Data + Roles
    B->>B: Generate JWT Token
    B-->>U: Return Token + Session
    U->>API: API Request with Token
    API->>B: Validate Token
    B-->>API: Token Valid + User Context
    API->>DB: Execute Query
    DB-->>API: Return Data
    API-->>U: JSON Response
```

### Leave Request Flow

```mermaid
sequenceDiagram
    participant E as Employee (Portal)
    participant API as Express API
    participant AUTH as Auth Service
    participant DB as PostgreSQL
    participant MGR as Manager/HR
    participant EMAIL as Email Service
    
    E->>API: Submit Leave Request
    API->>AUTH: Validate Token & Permissions
    AUTH-->>API: Authorized
    API->>DB: Check Leave Balance
    DB-->>API: Available Balance
    API->>DB: Create Leave Request
    DB-->>API: Request Created
    API->>EMAIL: Send Notification to Manager
    API-->>E: Request Submitted
    
    MGR->>API: Approve/Reject Request
    API->>AUTH: Validate Token
    API->>DB: Update Leave Request
    API->>DB: Update Leave Balance
    API->>EMAIL: Notify Employee
    API-->>MGR: Action Completed
```

### Payroll Processing Flow

```mermaid
sequenceDiagram
    participant HR as HR Admin
    participant API as Express API
    participant PAY as Payroll Engine
    participant DB as PostgreSQL
    participant BIO as Biometric System
    participant FS as File Storage
    participant EMAIL as Email Service
    
    HR->>API: Trigger Payroll Run
    API->>AUTH: Verify Admin Role
    API->>BIO: Fetch Attendance Data
    BIO-->>API: Attendance Records
    API->>DB: Get Employee Salary Data
    DB-->>API: Salary Structures
    API->>PAY: Calculate Payroll
    PAY->>DB: Fetch Deductions, Allowances
    DB-->>PAY: Configurations
    PAY->>PAY: Compute Net Pay
    PAY-->>API: Calculated Payslips
    API->>DB: Save Payroll Run
    API->>FS: Generate PDF Payslips
    FS-->>API: Payslips Generated
    API->>EMAIL: Send Payslips to Employees
    API-->>HR: Payroll Complete
```

## 7. Integration Architecture

### External System Integrations

```mermaid
graph LR
    subgraph "HRMS Core"
        API[Express API Gateway]
    end
    
    subgraph "Integrations"
        BIO[Biometric Systems<br/>- REST API<br/>- CSV Import]
        ERP[ERP/Accounting<br/>- API Integration<br/>- Export Formats]
        EMAIL[Email Service<br/>- SMTP/SendGrid<br/>- Templates]
        SMS[SMS Service<br/>- Notification Gateway]
        STORAGE[Cloud Storage<br/>- S3/Azure Blob<br/>- Document Store]
    end
    
    API -->|Attendance Sync| BIO
    API -->|Export Payroll| ERP
    API -->|Send Notifications| EMAIL
    API -->|Send Alerts| SMS
    API -->|Store Documents| STORAGE
```

### API Integration Patterns

```mermaid
sequenceDiagram
    participant HRMS as HRMS API
    participant QUEUE as Message Queue<br/>(Redis/RabbitMQ)
    participant INTEG as Integration Service
    participant EXT as External System
    
    HRMS->>QUEUE: Publish Integration Event
    QUEUE->>INTEG: Consume Event
    INTEG->>INTEG: Transform Data Format
    INTEG->>EXT: API Call
    alt Success
        EXT-->>INTEG: Success Response
        INTEG->>QUEUE: Acknowledge
        INTEG->>HRMS: Update Status
    else Failure
        EXT-->>INTEG: Error Response
        INTEG->>QUEUE: Retry Mechanism
    end
```

## 8. Caching Strategy

### Cache Architecture

```mermaid
graph TB
    subgraph "Application Layer"
        API[Express API Servers]
    end
    
    subgraph "Cache Layers"
        APP_CACHE[Application Cache<br/>- In-Memory<br/>- Short TTL]
        REDIS[(Redis Cache<br/>- Session Storage<br/>- Hot Data<br/>- Report Cache)]
        DB_CACHE[(Database Query Cache)]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL)]
    end
    
    API --> APP_CACHE
    APP_CACHE --> REDIS
    REDIS --> DB_CACHE
    DB_CACHE --> DB
    
    REDIS -.->|Cache Invalidation| APP_CACHE
```

## 9. Scalability Architecture

### Horizontal Scaling Strategy

```mermaid
graph TB
    LB[Load Balancer<br/>Round Robin]
    
    subgraph "Stateless API Tier"
        API1[API Instance 1]
        API2[API Instance 2]
        API3[API Instance N]
    end
    
    subgraph "Shared Services"
        SESSION[(Redis<br/>Session Store)]
        CACHE[(Redis<br/>Data Cache)]
    end
    
    subgraph "Database Tier"
        DBP[(Primary DB)]
        DBS1[(Replica 1)]
        DBS2[(Replica 2)]
    end
    
    subgraph "File Services"
        FS1[File Server 1]
        FS2[File Server 2]
    end
    
    LB --> API1
    LB --> API2
    LB --> API3
    
    API1 --> SESSION
    API2 --> SESSION
    API3 --> SESSION
    
    API1 --> CACHE
    API2 --> CACHE
    API3 --> CACHE
    
    API1 -.->|Read| DBS1
    API2 -.->|Read| DBS2
    API1 -.->|Write| DBP
    API2 -.->|Write| DBP
    API3 -.->|Write| DBP
    
    API1 --> FS1
    API2 --> FS2
    API3 --> FS1
```

## 10. Technology Stack Summary

### Frontend Stack
- **Framework**: React 18+
- **State Management**: Zustand
- **Routing**: React Router v6
- **Language**: TypeScript
- **HTTP Client**: Axios
- **UI Components**: Shadcn UI or Material-UI
- **Forms**: React Hook Form
- **Charts**: ApexCharts

### Backend Stack
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: Javascript
- **Authentication**: Better Auth
- **Validation**: Zod
- **ORM**: Prisma
- **Testing**: Jest

### Database Stack
- **Primary DB**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Full-text Search**: PostgreSQL Full-Text Search
- **Backup**: pg_dump + Cloud Storage

### DevOps Stack
- **Containerization**: Docker
- **Orchestration**: Docker Compose / Kubernetes
- **CI/CD**: GitHub Actions / Jenkins
- **Monitoring**: Prometheus + Grafana
- **Logging**: Winston + ELK Stack
- **APM**: New Relic / Datadog

## 11. Deployment Models

### Model Selection Criteria

| Deployment Model   | Use Case                        | Pros                           | Cons                            |
| ------------------ | ------------------------------- | ------------------------------ | ------------------------------- |
| **Cloud (Public)** | High scalability, global access | Auto-scaling, managed services | Ongoing costs, data sovereignty |
| **On-Premise**     | Data security, compliance       | Full control, no ongoing fees  | High initial cost, maintenance  |
| **Hybrid**         | Best of both worlds             | Flexibility, gradual migration | Complexity, network latency     |

### Recommended Approach

For Datafin HRMS, a **Cloud Deployment Model** is implemented:
- **Frontend**: Vercel (hosting React web application with global CDN)
- **Backend**: Render (hosting Express.js API servers)
- **Database**: Render PostgreSQL (cloud-hosted with automatic backups)
- **Cache**: Redis (managed by Render or cloud provider)

This model provides:
- Accessibility for employees from anywhere
- Automatic scaling and high availability
- Security with HTTPS/SSL encryption
- Cost-effective managed services
- Global CDN for fast frontend delivery
- Easy deployment and maintenance

