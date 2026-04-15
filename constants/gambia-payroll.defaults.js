/**
 * TAX (PAYE) – GRA progressive bands (monthly)
 * Income tax follows Gambia Revenue Authority (GRA) PAYE First Schedule (published 2025 table):
 * - Monthly tax-free threshold: GMD 3,000 (annual 36,000).
 * - Above that, marginal bands (monthly GMD): up to 3,833.33 @ 5%, up to 4,666.67 @ 10%,
 *   up to 5,500 @ 15%, up to 6,333.33 @ 20%, above 6,333.33 @ 25%.
 * - Tax = sum of (amount in each band × band rate). No deductions from gross
 *   before tax; tax is on full gross employment income (salary + bonuses + benefits).
 *
 * SSN (SOCIAL SECURITY)
 * - Employee share: 5% of gross pay (may be deducted from pay OR paid by employer on behalf, per tenant setting).
 * - Employer share: typically 10% of gross pay (company cost, not deducted from pay).
 * - Employee deductions affect net pay; employer contributions are shown separately for transparency/reporting.
 */

/** Monthly tax-free threshold (GMD). */
export const GAMBIA_PAYE_THRESHOLD = 3000;

/** SSN employee rate (5% of gross). */
export const GAMBIA_SSN_EMPLOYEE_RATE = 0.05;

/** Default employer social security rate (%) for Gambia when not configured on tenant. */
export const GAMBIA_SSN_EMPLOYER_DEFAULT_RATE_PERCENT = 10;

function round2(amount) {
    return Math.round((Number(amount) || 0) * 100) / 100;
}

/**
 * Resolve employer SS rate (%) from tenant setting, with optional default for Gambia statutory.
 * @param {number|null|undefined} tenantRatePercent
 * @param {boolean} gambiaStatutoryEnabled
 * @returns {number|null} Rate percent or null when not applicable/available
 */
export function resolveEmployerSocialSecurityRatePercent(tenantRatePercent, gambiaStatutoryEnabled) {
    const n = tenantRatePercent == null ? null : Number(tenantRatePercent);
    if (n != null && !Number.isNaN(n)) return n;
    return gambiaStatutoryEnabled ? GAMBIA_SSN_EMPLOYER_DEFAULT_RATE_PERCENT : null;
}

/**
 * Build employer-side social security contribution lines for display/reporting.
 * These do not affect net pay.
 *
 * @param {number} grossSalary
 * @param {"DEDUCT_FROM_EMPLOYEE"|"EMPLOYER_PAYS_ON_BEHALF"|null|undefined} ssnFundingMode
 * @param {number|null|undefined} employerRatePercent - Employer share rate (% of gross)
 * @returns {Array<{ name: string, amount: number, calculationMethod: "PERCENTAGE", description: string }>}
 */
export function buildGambiaEmployerContributionLines(grossSalary, ssnFundingMode, employerRatePercent) {
    const lines = [];
    const employerRate = employerRatePercent != null && !Number.isNaN(Number(employerRatePercent)) ? Number(employerRatePercent) : 0;
    if (employerRate > 0) {
        lines.push({
            name: "Employer SSHFC",
            amount: round2(Number(grossSalary) * (employerRate / 100)),
            calculationMethod: "PERCENTAGE",
            description: `${employerRate}% of gross`,
        });
    }
    if (ssnFundingMode === "EMPLOYER_PAYS_ON_BEHALF") {
        lines.push({
            name: "SSN - Employee share (paid by employer)",
            amount: round2(Number(grossSalary) * GAMBIA_SSN_EMPLOYEE_RATE),
            calculationMethod: "PERCENTAGE",
            description: "5% of gross",
        });
    }
    return lines;
}

/**
 * GRA PAYE bands: { maxMonthly: upper bound of band (GMD), rate: marginal rate (0–1) }
 * Amount in band = min(gross, maxMonthly) - previous band's maxMonthly; tax += amountInBand * rate
 * Bounds match GRA monthly First Schedule (~833.33 per band above the threshold).
 */
export const GAMBIA_PAYE_BANDS = [
    { maxMonthly: 3833.33, rate: 0.05 },
    { maxMonthly: 4666.67, rate: 0.1 },
    { maxMonthly: 5500, rate: 0.15 },
    { maxMonthly: 6333.33, rate: 0.2 },
    { maxMonthly: Infinity, rate: 0.25 },
];

/**
 * Calculate Gambia PAYE (income tax) for a given monthly gross (GMD).
 * Uses GRA progressive bands; tax-free threshold 3,000.
 * @param {number} monthlyGross - Monthly gross employment income (GMD)
 * @returns {number} PAYE amount (GMD)
 */
export function calculateGambiaPAYE(monthlyGross) {
    if (monthlyGross <= GAMBIA_PAYE_THRESHOLD) return 0;
    let tax = 0;
    let prevUpper = GAMBIA_PAYE_THRESHOLD;
    for (const band of GAMBIA_PAYE_BANDS) {
        const bandUpper = band.maxMonthly;
        const amountInBand = Math.min(monthlyGross, bandUpper) - prevUpper;
        if (amountInBand <= 0) break;
        tax += amountInBand * band.rate;
        prevUpper = bandUpper;
        if (monthlyGross <= bandUpper) break;
    }
    return Math.round(tax * 100) / 100;
}
