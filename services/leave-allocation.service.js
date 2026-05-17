import { DateTime } from "luxon";

/**
 * Tenure threshold (in calendar months) required before an employee is entitled to either
 * the annual or the sick allocation pool. Per Gambia Labour Act §50 and the client's
 * applicable agreements. Hard-coded — not configurable per tenant.
 */
export const TENURE_THRESHOLD_MONTHS = 12;

/**
 * @typedef {Object} AllocationResult
 * @property {number} allocatedDays
 * @property {number} allocatedSickDays
 * @property {boolean} eligible - true if employee has crossed the tenure threshold by year-end
 * @property {Date | null} eligibilityDate - hireDate + 12 months (null when hireDate is null)
 */

/**
 * Compute initial leave allocation for an employee for a given year. Pure — no DB writes.
 *
 * Tenure rule applies to BOTH annual and sick pools: employee must have a non-null hireDate
 * and have served 12 calendar months by year-end. Otherwise both pools are 0.
 *
 * Annual leave allocation is tiered by years of service (Gambia Labour Act §50):
 *   - 1-3 years: 14 days
 *   - 3-7 years: 21 days
 *   - 7+ years: 30 days
 *
 * Sick leave allocation is tiered by years of service (working days per 12-month period):
 *   - 1-3 years: 14 days
 *   - 3-5 years: 28 days
 *   - 5-10 years: 42 days
 *   - 10+ years: 63 days
 *
 * Tier is determined based on years of service as of year-end. If employee crosses the
 * 12-month eligibility threshold mid-year, allocation is pro-rata: (daysPerYear / 12) * monthsRemaining.
 *
 * For ACCRUAL policies, `allocatedDays` is always 0 (accrual builds `accruedDays` separately);
 * the sick pool still follows the tenure-gated allocation logic when enabled.
 *
 * @param {{
 *   user: { hireDate: Date | string | null },
 *   policy: {
 *     accrualMethod: 'FRONT_LOADED' | 'ACCRUAL',
 *     defaultDaysPerYear: number,
 *     sickLeaveAllocationEnabled: boolean,
 *     allocatedSickDaysPerYear: number,
 *   },
 *   year: number,
 * }} params
 * @returns {AllocationResult}
 */
export const computeInitialAllocation = ({ user, policy, year }) => {
  const yearStart = DateTime.fromObject({ year, month: 1, day: 1 });
  const yearEnd = DateTime.fromObject({ year, month: 12, day: 31 });

  if (!user?.hireDate) {
    return { allocatedDays: 0, allocatedSickDays: 0, eligible: false, eligibilityDate: null };
  }

  const hire = DateTime.fromJSDate(new Date(user.hireDate));
  const eligibilityDate = hire.plus({ months: TENURE_THRESHOLD_MONTHS });

  if (eligibilityDate > yearEnd) {
    return {
      allocatedDays: 0,
      allocatedSickDays: 0,
      eligible: false,
      eligibilityDate: eligibilityDate.toJSDate(),
    };
  }

  // Calculate years of service as of year-end to determine tier
  const yearsOfServiceAtYearEnd = yearEnd.diff(hire, "years").years;
  const annualPerYear = getTieredAnnualAllocation(yearsOfServiceAtYearEnd, policy);

  const sickEnabled = policy.sickLeaveAllocationEnabled === true;
  const sickPerYear = sickEnabled ? getTieredSickAllocation(yearsOfServiceAtYearEnd) : 0;

  let annualAllocated;
  let sickAllocated;

  if (eligibilityDate <= yearStart) {
    // Eligible before year started: full allocation
    annualAllocated = annualPerYear;
    sickAllocated = sickPerYear;
  } else {
    // Eligibility falls mid-year: pro-rata from eligibility month to year-end inclusive.
    const monthsRemaining = 13 - eligibilityDate.month;
    annualAllocated = (annualPerYear / 12) * monthsRemaining;
    sickAllocated = (sickPerYear / 12) * monthsRemaining;
  }

  return {
    allocatedDays: round2(annualAllocated),
    allocatedSickDays: round2(sickAllocated),
    eligible: true,
    eligibilityDate: eligibilityDate.toJSDate(),
  };
};

/**
 * Determine annual leave allocation (in days) based on years of service tier.
 * Tiered per Gambia Labour Act §50.
 *
 * @param {number} yearsOfService
 * @param {{accrualMethod?: string}} policy - only used to check if ACCRUAL method (returns 0)
 * @returns {number} days per year
 */
function getTieredAnnualAllocation(yearsOfService, policy) {
  // ACCRUAL method doesn't front-load any allocation
  if (policy?.accrualMethod === "ACCRUAL") return 0;

  if (yearsOfService < 1) return 0;
  if (yearsOfService < 3) return 14;
  if (yearsOfService < 7) return 21;
  return 30;
}

/**
 * Determine sick leave allocation (in working days) based on years of service tier.
 * Tiered per Gambia Labour Act (working days per 12-month period).
 *
 * @param {number} yearsOfService
 * @returns {number} working days per year
 */
function getTieredSickAllocation(yearsOfService) {
  if (yearsOfService < 1) return 0;
  if (yearsOfService < 3) return 14;
  if (yearsOfService < 5) return 28;
  if (yearsOfService < 10) return 42;
  return 63;
}

/**
 * Compute available balances for an entitlement, branched by pool. Pure.
 *
 * @param {Object} entitlement - YearlyEntitlement row (must include all balance fields)
 * @param {{ deductsFromAnnual?: boolean, deductsFromSickAllocation?: boolean }} [leaveType]
 * @returns {{ annual: number, sick: number, forLeaveType: number }}
 *   `forLeaveType` is the pool the given leave type draws from, or `Infinity` when it deducts
 *   from neither pool (unbounded, e.g. bereavement).
 */
export const computeAvailableBalance = (entitlement, leaveType) => {
  const annual =
    entitlement.allocatedDays +
    entitlement.accruedDays +
    entitlement.carriedOverDays +
    entitlement.adjustmentDays -
    entitlement.usedDays -
    entitlement.pendingDays;

  const sick =
    (entitlement.allocatedSickDays ?? 0) +
    (entitlement.sickAdjustmentDays ?? 0) -
    (entitlement.usedSickDays ?? 0) -
    (entitlement.pendingSickDays ?? 0);

  let forLeaveType = Number.POSITIVE_INFINITY;
  if (leaveType?.deductsFromSickAllocation) forLeaveType = sick;
  else if (leaveType?.deductsFromAnnual) forLeaveType = annual;

  return { annual, sick, forLeaveType };
};

/**
 * Which pool a leave type draws from. Useful for branching mutations.
 * @param {{ deductsFromAnnual?: boolean, deductsFromSickAllocation?: boolean }} leaveType
 * @returns {'annual' | 'sick' | 'none'}
 */
export const leaveTypePool = (leaveType) => {
  if (leaveType?.deductsFromSickAllocation) return "sick";
  if (leaveType?.deductsFromAnnual) return "annual";
  return "none";
};

const round2 = (n) => Math.round(n * 100) / 100;
