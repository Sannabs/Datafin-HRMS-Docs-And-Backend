# Library Migration Implementation Plan

## Overview

This plan outlines the migration from custom implementations to industry-standard libraries for critical HRMS components. The migration will improve scalability, maintainability, and feature completeness.

## Goals

1. **Improve Performance**: Process 5,000+ employees in 30 minutes (current requirement)
2. **Increase Reliability**: Add job persistence, retry mechanisms, and fault tolerance
3. **Enhance Maintainability**: Use proven libraries instead of custom code
4. **Enable Features**: Implement FORMULA calculation type
5. **Better State Management**: Robust status transition handling

---

## Phase 1: Job Queue Migration (BullMQ) - **CRITICAL PRIORITY**

### Why First?
- **Blocking Issue**: Current sequential processing cannot scale
- **Performance Requirement**: Must process 5,000 employees in 30 minutes
- **Reliability**: Jobs lost on server crash

### Prerequisites
- Redis server (local for dev, managed for production)
- Redis connection configuration

### Implementation Steps

#### 1.1 Setup and Installation
- [ ] Install dependencies: `npm install bullmq ioredis`
- [ ] Add Redis connection configuration to `backend/config/redis.config.js`
- [ ] Add Redis environment variables to `.env`:
  ```env
  REDIS_HOST=localhost
  REDIS_PORT=6379
  REDIS_PASSWORD= (optional)
  REDIS_DB=0
  ```

#### 1.2 Database Schema Update
- [ ] Update `backend/prisma/schema.prisma`:
  - Add `queueJobId String?` field to `PayrollRun` model
  - Add index on `queueJobId` for quick lookups
  ```prisma
  model PayrollRun {
    // ... existing fields ...
    queueJobId String? // BullMQ parent job ID (optional for backward compatibility)
    // ... rest of fields ...
    
    @@index([queueJobId]) // Index for quick lookups
  }
  ```
- [ ] Create and run migration: `npx prisma migrate dev --name add_queue_job_id_to_payroll_run`
- [ ] Generate Prisma client: `npx prisma generate`
- [ ] Verify migration applied successfully

#### 1.3 Create Queue Infrastructure
- [ ] Create `backend/queues/payroll.queue.js`:
  - Define queue with Redis connection
  - Configure job options (retries, backoff, priority)
  - Export queue instance
  - Store `queueJobId` in `PayrollRun.queueJobId` when creating parent job

- [ ] Create `backend/workers/payroll.worker.js`:
  - Define worker with concurrency (start with 5)
  - Process employee payroll jobs
  - Handle job completion/failure
  - Update progress tracking
  - Link jobs to `PayrollRun` via `queueJobId`

#### 1.4 Refactor Payroll Service
- [ ] Modify `backend/services/payroll-run.service.js`:
  - Remove sequential `for` loop
  - Create parent job for entire payroll run
  - Store parent job ID in `PayrollRun.queueJobId`
  - Add individual employee jobs to queue
  - Return immediately with parent job ID
  - Keep `processEmployeePayroll` function (used by worker)

#### 1.5 Update Controller
- [ ] Modify `backend/controllers/payroll-run.controller.js`:
  - Change `processPayrollRun` to queue jobs
  - Store `queueJobId` in `PayrollRun` record
  - Add endpoint to check job status (using `queueJobId`)
  - Add endpoint to get queue metrics
  - Add endpoint to get job status by `PayrollRun.id` (lookup via `queueJobId`)

#### 1.6 Progress Tracking Integration
- [ ] Update `backend/services/payroll-progress.service.js`:
  - Integrate with BullMQ job progress
  - Use BullMQ's built-in progress events
  - Maintain backward compatibility with existing progress records

#### 1.7 Error Handling and Retries
- [ ] Configure retry strategy:
  - Max attempts: 3
  - Backoff: Exponential (2s, 4s, 8s)
  - Dead letter queue for permanent failures

#### 1.8 Testing
- [ ] Unit tests for queue operations
- [ ] Integration tests for worker processing
- [ ] Load test with 100+ employees
- [ ] Test server restart recovery

#### 1.9 Monitoring
- [ ] Add BullMQ dashboard (Bull Board) for monitoring
- [ ] Log queue metrics (pending, active, completed, failed)
- [ ] Alert on high failure rates

### Migration Strategy
1. **Parallel Run**: Run both old and new systems side-by-side
2. **Feature Flag**: Use environment variable to switch between implementations
3. **Gradual Rollout**: Test with small payroll runs first
4. **Full Migration**: Once validated, remove old sequential code

### Rollback Plan
- Keep old sequential code commented for 1 release cycle
- Feature flag allows instant rollback
- Monitor error rates and performance metrics

### Success Criteria
- ✅ Process 1,000 employees in < 10 minutes
- ✅ Jobs survive server restart
- ✅ Automatic retry on transient failures
- ✅ No data loss during processing
- ✅ API remains responsive during payroll runs

---

## Phase 2: State Machine Migration (XState) - **IMPORTANT**

### Why Second?
- **Maintainability**: Adding new statuses is error-prone
- **Business Logic**: Complex transition rules needed
- **Documentation**: Visual state diagrams

### Implementation Steps

#### 2.1 Setup and Installation
- [ ] Install dependencies: `npm install xstate @xstate/react` (if needed for frontend)
- [ ] Create state machine definitions

#### 2.2 Define Pay Period State Machine
- [ ] Create `backend/state-machines/pay-period.machine.js`:
  - Define states: DRAFT, PROCESSING, COMPLETED, CLOSED
  - Define transitions with guards
  - Add actions (send email, update database, audit log)
  - Add context (payPeriod data, tenantId)

#### 2.3 Define Payroll Run State Machine
- [ ] Create `backend/state-machines/payroll-run.machine.js`:
  - States: DRAFT, PROCESSING, COMPLETED, FAILED
  - Transitions with business rules
  - Guards (e.g., can't complete if employees failed)

#### 2.4 Refactor Status Validation
- [ ] Replace `validateStatusTransition` in `backend/utils/pay-period.utils.js`:
  - Use XState machine to validate transitions
  - Return detailed error messages from guards

#### 2.5 Update Services
- [ ] Modify `backend/services/pay-period-automation.service.js`:
  - Use state machine for status updates
  - Trigger actions on state changes
  - Use guards to prevent invalid transitions

#### 2.6 Update Controllers
- [ ] Modify `backend/controllers/pay-period.controller.js`:
  - Use state machine for status updates
  - Return machine state in responses

#### 2.7 Testing
- [ ] Unit tests for state machine definitions
- [ ] Integration tests for state transitions
- [ ] Test all guard conditions
- [ ] Test action execution

### Migration Strategy
- **Gradual**: Start with Pay Period, then Payroll Run
- **Backward Compatible**: Keep existing status enum values
- **Documentation**: Generate state diagrams from machines

### Success Criteria
- ✅ All existing status transitions work
- ✅ Invalid transitions properly rejected
- ✅ Actions execute on state changes
- ✅ Visual state diagrams generated

---

## Phase 3: Rule Engine Migration (json-rules-engine) - **MODERATE PRIORITY**

### Why Third?
- **Feature Enhancement**: Better rule evaluation
- **Performance**: Rule caching and optimization
- **Flexibility**: More operators and rule composition

### Implementation Steps

#### 3.1 Setup and Installation
- [ ] Install dependencies: `npm install json-rules-engine`

#### 3.2 Refactor Rule Evaluation
- [ ] Create `backend/services/rule-engine-v2.service.js`:
  - Wrap json-rules-engine
  - Convert existing rule format to json-rules-engine format
  - Maintain backward compatibility

#### 3.3 Rule Format Migration
- [ ] Create migration script to convert existing rules:
  - Map operators (equals → fact operator)
  - Convert condition trees to rule sets
  - Preserve priority and active status

#### 3.4 Update Calculation Service
- [ ] Modify `backend/calculations/salary-calculations.js`:
  - Use new rule engine service
  - Keep same function signatures (backward compatible)

#### 3.5 Add New Operators
- [ ] Document new available operators:
  - Date comparisons
  - String operations
  - Array operations
  - Mathematical operations

#### 3.6 Performance Optimization
- [ ] Implement rule caching:
  - Cache compiled rules per tenant
  - Invalidate on rule updates
  - Cache fact results

#### 3.7 Testing
- [ ] Test all existing rules work
- [ ] Test new operators
- [ ] Performance benchmarks
- [ ] Rule composition tests

### Migration Strategy
- **Parallel**: Run both engines, compare results
- **Validation**: Ensure same results for existing rules
- **Gradual**: Migrate rules one tenant at a time

### Success Criteria
- ✅ All existing rules produce same results
- ✅ New operators available
- ✅ Performance improved (caching)
- ✅ Rule composition works

---

## Phase 4: Formula Evaluator (mathjs) - **REQUIRED FOR FEATURE**

### Why Fourth?
- **Feature Completion**: FORMULA type is already planned but not implemented
- **Security**: Safe expression evaluation
- **User Requirement**: Users need formula calculations

### Implementation Steps

#### 4.1 Setup and Installation
- [ ] Install dependencies: `npm install mathjs`

#### 4.2 Implement Formula Evaluation
- [ ] Update `backend/services/rule-engine.service.js`:
  - Implement FORMULA case in `calculateRuleAmount`
  - Use mathjs to evaluate expressions
  - Support variables: `baseSalary`, `grossSalary`, `employeeContext.*`

#### 4.3 Security Configuration
- [ ] Configure mathjs for safe evaluation:
  - Disable dangerous functions (eval, import, etc.)
  - Whitelist allowed functions
  - Sanitize user input

#### 4.4 Variable Substitution
- [ ] Create variable resolver:
  - Map `baseSalary` → actual base salary
  - Map `grossSalary` → calculated gross salary
  - Map `employeeContext.departmentId` → department value
  - Support nested properties

#### 4.5 Error Handling
- [ ] Validate formula syntax before evaluation
- [ ] Return clear error messages for invalid formulas
- [ ] Log formula evaluation errors

#### 4.6 Testing
- [ ] Test basic formulas: `baseSalary * 0.1`
- [ ] Test complex formulas: `(baseSalary * 0.1) + (grossSalary * 0.05) + 500`
- [ ] Test with variables: `baseSalary + employeeContext.bonus`
- [ ] Test error cases (invalid syntax, division by zero)
- [ ] Security tests (injection attempts)

#### 4.7 Documentation
- [ ] Document formula syntax
- [ ] List available variables
- [ ] Provide formula examples
- [ ] Document security restrictions

### Migration Strategy
- **New Feature**: No migration needed (feature doesn't exist yet)
- **Enable Gradually**: Start with simple formulas, add complexity

### Success Criteria
- ✅ FORMULA calculation type works
- ✅ Formulas evaluate correctly
- ✅ Variables substitute properly
- ✅ Security: No code injection possible
- ✅ Clear error messages
