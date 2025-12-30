# Deferred Features

This document tracks features that have been identified as valuable but deferred for future implementation. Each feature includes rationale for deferment and implementation notes for when the time comes.

---

## Table of Contents
1. [Payroll Pro-rating](#1-payroll-pro-rating)
2. [Future Additions](#future-additions)

---

## 1. Payroll Pro-rating

**Module:** Payroll (Section 6 - Corrections & Adjustments)  
**Priority:** Medium  
**Complexity:** High  
**Status:** Deferred

### Description
Automatically calculate partial month salaries when salary changes occur mid-pay period (e.g., promotions, raises, new hires, terminations).

### Use Cases
- Employee gets a raise on the 15th of the month
- New hire starts on the 10th
- Employee terminates on the 20th
- Allowance added/removed mid-month

### Current Workaround
Use the **Adjustment Payslip** feature (`POST /payslips/:id/adjustment`) to manually create corrections with the calculated pro-rated amounts.

### Why Deferred
| Reason            | Details                                              |
| ----------------- | ---------------------------------------------------- |
| Complexity        | Many edge cases and company-specific rules           |
| Variability       | Different companies use different pro-rating methods |
| Low Frequency     | Mid-month changes are relatively rare                |
| Workaround Exists | Adjustment payslips can handle manual corrections    |

### Implementation Notes (When Ready)

#### Configuration Options Needed
```javascript
// Suggested tenant-level configuration
{
  proRating: {
    enabled: true,
    method: "WORKING_DAYS" | "CALENDAR_DAYS",
    roundingRule: "UP" | "DOWN" | "NEAREST",
    components: {
      baseSalary: true,
      allowances: true,  // or specify which allowance types
      deductions: true
    }
  }
}
```

#### Algorithm (Working Days Method)
```
1. Get total working days in the month
2. Get working days before change (old rate period)
3. Get working days after change (new rate period)
4. Calculate:
   - Old portion = (old_rate / total_days) * days_at_old_rate
   - New portion = (new_rate / total_days) * days_at_new_rate
   - Pro-rated salary = Old portion + New portion
```

#### Files to Modify
- `services/payroll-run.service.js` - Add pro-rating calculation
- `utils/working-days.utils.js` - Already has working days calculation
- `prisma/schema.prisma` - Add tenant pro-rating config (or use JSON field)
- `controllers/payroll-run.controller.js` - Apply pro-rating during processing

#### Edge Cases to Handle
- [ ] Multiple salary changes in one month
- [ ] New hire mid-month (no previous salary)
- [ ] Termination mid-month
- [ ] Unpaid leave periods
- [ ] Holidays falling in transition period
- [ ] Weekend configurations (tenant-specific)

#### Estimated Effort
- Development: 2-3 days
- Testing: 1-2 days
- Documentation: 0.5 day

---

## Future Additions

*Add new deferred features below as they are identified.*

### Template for New Features

```markdown
## [Feature Number]. [Feature Name]

**Module:** [Module Name]  
**Priority:** Low | Medium | High  
**Complexity:** Low | Medium | High  
**Status:** Deferred

### Description
[Brief description of the feature]

### Use Cases
- [Use case 1]
- [Use case 2]

### Current Workaround
[How users can achieve similar results with current features]

### Why Deferred
| Reason     | Details   |
| ---------- | --------- |
| [Reason 1] | [Details] |

### Implementation Notes (When Ready)
[Technical notes, algorithms, files to modify, etc.]

### Estimated Effort
- Development: X days
- Testing: X days
- Documentation: X days
```

---

## Review Schedule

Deferred features should be reviewed:
- **Quarterly** - Reassess priorities based on user feedback
- **Before major releases** - Consider including high-value deferred items
- **When dependencies change** - Some features may become easier to implement

---

*Last Updated: December 2024*  
*Maintainer: Development Team*

