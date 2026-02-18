/**
 * TAX (PAYE) – GRA progressive bands (monthly)
 * Income tax follows Gambia Revenue Authority (GRA) PAYE rules:
 * - Monthly tax-free threshold: GMD 3,000 (annual 36,000).
 * - Above that, income is taxed in bands at marginal rates:
 *   3,001–3,833 @ 10%, 3,834–4,667 @ 15%, 4,668–5,500 @ 20%,
 *   5,501–6,333 @ 25%, above 6,333 @ 30%.
 * - Tax = sum of (amount in each band × band rate). No deductions from gross
 *   before tax; tax is on full gross employment income (salary + bonuses + benefits).
 *
 * SSN (SOCIAL SECURITY)
 * - Employee share: 5% of gross pay (deducted from pay).
 * - Employer share: 10% of gross pay (company cost, not deducted from pay).
 * - Our system stores and deducts only the employee 5%; employer 10% is for
 *   reporting/records (e.g. from tenant.employerSocialSecurityRate) and does
 *   not affect net pay.
 */

/** Monthly tax-free threshold (GMD). */
export const GAMBIA_PAYE_THRESHOLD = 3000;

/** SSN employee rate (5% of gross). */
export const GAMBIA_SSN_EMPLOYEE_RATE = 0.05;

/**
 * GRA PAYE bands: { maxMonthly: upper bound of band (GMD), rate: marginal rate (0–1) }
 * Amount in band = min(gross, maxMonthly) - previous band's maxMonthly; tax += amountInBand * rate
 */
export const GAMBIA_PAYE_BANDS = [
    { maxMonthly: 3833, rate: 0.1 },
    { maxMonthly: 4667, rate: 0.15 },
    { maxMonthly: 5500, rate: 0.2 },
    { maxMonthly: 6333, rate: 0.25 },
    { maxMonthly: Infinity, rate: 0.3 },
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
